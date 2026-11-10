import json
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://www.errandom.com"


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.tags = []
        self.structured_data = []
        self.json_buffer = None
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.json_buffer = ""

    def handle_data(self, data):
        if self.json_buffer is not None:
            self.json_buffer += data

    def handle_endtag(self, tag):
        if tag == "script" and self.json_buffer is not None:
            self.structured_data.append(json.loads(self.json_buffer))
            self.json_buffer = None

    def values(self, tag, selector, value, attribute):
        return [
            attrs.get(attribute, "")
            for name, attrs in self.tags
            if name == tag and attrs.get(selector) == value
        ]

    def is_indexable(self):
        robots = self.values("meta", "name", "robots", "content")
        return not any("noindex" in value.lower() for value in robots)


class SeoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pages = {
            "/" + "/".join(path.relative_to(ROOT).parent.parts)
            + ("/" if path.parent != ROOT else ""): Page(path)
            for path in ROOT.rglob("index.html")
        }

    def test_public_pages_use_one_canonical_host_and_consistent_metadata(self):
        for route, page in self.pages.items():
            if not page.is_indexable():
                continue
            with self.subTest(route=route):
                canonical = ORIGIN + route
                self.assertEqual(
                    page.values("link", "rel", "canonical", "href"), [canonical]
                )
                descriptions = page.values("meta", "name", "description", "content")
                self.assertEqual(len(descriptions), 1)
                self.assertTrue(descriptions[0].strip())
                social_urls = page.values("meta", "property", "og:url", "content")
                if social_urls:
                    self.assertEqual(social_urls, [canonical])

    def test_sitemap_covers_only_public_canonical_pages(self):
        tree = ElementTree.parse(ROOT / "sitemap.xml")
        urls = [
            node.text
            for node in tree.findall("{*}url/{*}loc")
        ]
        expected = {
            ORIGIN + route
            for route, page in self.pages.items()
            if page.is_indexable()
        }
        self.assertEqual(len(urls), len(set(urls)))
        self.assertEqual(set(urls), expected)
        self.assertNotIn(ORIGIN + "/civic/account/", urls)
        self.assertFalse(any(urlsplit(url).hostname != "www.errandom.com" for url in urls))

    def test_robots_advertises_sitemap_without_blocking_noindex_page(self):
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn(f"Sitemap: {ORIGIN}/sitemap.xml", robots)
        self.assertIn("User-agent: *", robots)
        self.assertFalse(any(line.startswith("Disallow: /") for line in robots.splitlines()))
        self.assertFalse(self.pages["/civic/account/"].is_indexable())

    def test_marketing_pages_are_crawlable_without_redirects_or_app_assets(self):
        for route in ["/argos/", "/coveriq/", "/QMT/"]:
            page = self.pages[route]
            with self.subTest(route=route):
                self.assertTrue(page.is_indexable())
                self.assertFalse(page.values("meta", "http-equiv", "refresh", "content"))
                self.assertEqual(sum(tag == "h1" for tag, _ in page.tags), 1)
                self.assertTrue(any(tag == "main" for tag, _ in page.tags))
                for tag, attrs in page.tags:
                    if tag == "script" and attrs.get("src"):
                        self.assertFalse(urlsplit(attrs["src"]).netloc)
        coveriq = self.pages["/coveriq/"]
        self.assertFalse(any(tag in {"form", "iframe", "script"} for tag, _ in coveriq.tags))
        self.assertIn(
            "https://coveriq.errandom.com/",
            [attrs.get("href") for tag, attrs in coveriq.tags if tag == "a"],
        )

    def test_changed_pages_have_resolvable_local_links_and_assets(self):
        for route in ["/", "/argos/", "/coveriq/", "/QMT/", "/consulting/"]:
            page = self.pages[route]
            for tag, attrs in page.tags:
                reference = attrs.get("href") if tag in {"a", "link"} else attrs.get("src")
                if not reference or reference.startswith(("#", "mailto:", "data:")):
                    continue
                target = urlsplit(urljoin(ORIGIN + route, reference))
                if target.netloc != "www.errandom.com":
                    continue
                path = ROOT / unquote(target.path).lstrip("/")
                if target.path.endswith("/"):
                    path /= "index.html"
                with self.subTest(route=route, reference=reference):
                    self.assertTrue(path.is_file(), f"Missing local target: {path}")
                    if target.fragment and path.suffix == ".html":
                        target_page = Page(path)
                        self.assertIn(
                            unquote(target.fragment),
                            [attrs.get("id") for _, attrs in target_page.tags],
                        )

    def test_homepage_describes_organization_and_links_to_public_product_pages(self):
        home = self.pages["/"]
        nodes = [
            node
            for data in home.structured_data
            for node in data.get("@graph", [data])
        ]
        organizations = [node for node in nodes if node["@type"] == "Organization"]
        self.assertEqual(len(organizations), 1)
        organization = organizations[0]
        self.assertEqual(organization["url"], ORIGIN + "/")
        self.assertEqual(organization["name"], "errandom")
        self.assertNotIn("aggregateRating", organization)
        links = [attrs.get("href") for tag, attrs in home.tags if tag == "a"]
        for route in ["/argos/", "/coveriq/", "/QMT/"]:
            self.assertIn(route, links)

    def test_argos_application_destination_and_consent_are_preserved(self):
        page = self.pages["/argos/"]
        forms = [attrs for tag, attrs in page.tags if tag == "form"]
        self.assertEqual(len(forms), 1)
        self.assertEqual(forms[0]["action"], "https://argos.errandom.com/api/beta/apply")
        self.assertEqual(forms[0]["method"], "post")
        inputs = {attrs.get("name"): attrs for tag, attrs in page.tags if tag == "input"}
        self.assertIn("required", inputs["eligible"])
        self.assertIn("required", inputs["contactConsent"])


if __name__ == "__main__":
    unittest.main()
