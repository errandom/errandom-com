const form = document.getElementById("beta-form");
const button = document.getElementById("apply-button");
const status = document.getElementById("application-status");
const source = new URLSearchParams(location.search).get("utm_source");
if (source && /^[a-z0-9_-]{1,64}$/i.test(source)) document.getElementById("source").value = source;

form.addEventListener("invalid", event => event.target.setAttribute("aria-invalid", "true"), true);
form.addEventListener("input", event => {
  if (event.target.validity?.valid) event.target.removeAttribute("aria-invalid");
});
form.addEventListener("change", event => {
  if (event.target.validity?.valid) event.target.removeAttribute("aria-invalid");
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = "Saving your application...";
  form.setAttribute("aria-busy", "true");
  status.classList.remove("error");
  status.textContent = "Saving your application...";
  try {
    const response = await fetch(form.action, {
      method: "POST", credentials: "omit", headers: { Accept: "application/json" },
      body: new URLSearchParams(new FormData(form)), signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true) {
      throw new Error(data.error || "Your application wasn't saved. Please try again.");
    }
    form.hidden = true;
    status.textContent = "";
    const confirmation = document.getElementById("confirmation");
    confirmation.hidden = false;
    confirmation.focus();
  } catch (error) {
    status.classList.add("error");
    status.textContent = error instanceof TypeError || error instanceof SyntaxError || ["TimeoutError", "AbortError"].includes(error.name)
      ? "We couldn't confirm your application was saved. Your details are still here. Please try again, or contact info@errandom.com."
      : error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Apply for the beta";
    form.removeAttribute("aria-busy");
  }
});
