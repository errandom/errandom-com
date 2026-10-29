"use strict";

const form = document.getElementById("enquiry-form");
const offer = document.getElementById("offer");
const task = document.getElementById("task");
const preview = document.getElementById("email-preview");
const draft = document.getElementById("email-draft");
const emailLink = document.getElementById("open-email");

document.querySelectorAll("[data-offer]").forEach((link) => {
  link.addEventListener("click", () => {
    offer.value = link.dataset.offer;
    preview.hidden = true;
  });
});

form.addEventListener("input", () => {
  preview.hidden = true;
  task.setCustomValidity("");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!task.value.trim()) {
    task.setCustomValidity("Please describe the task you'd like help with.");
    task.reportValidity();
    return;
  }
  const name = document.getElementById("contact-name").value.trim();
  const business = document.getElementById("business").value.trim();
  const packageName = offer.selectedOptions[0].textContent;
  const subject = `errandom Consulting enquiry - ${packageName}`;
  const message = [
    "Hi Kenneth,",
    "",
    `I'm interested in: ${packageName}`,
    ...(name ? [`Name: ${name}`] : []),
    ...(business ? [`Business or website: ${business}`] : []),
    "",
    "What I'd like help with:",
    task.value.trim(),
    "",
    "Please let me know whether this is a fit and what the next steps would be.",
    "I understand this is an enquiry, not an order or subscription.",
  ].join("\r\n");

  draft.value = `To: info@errandom.com\r\nSubject: ${subject}\r\n\r\n${message}`;
  emailLink.href = `mailto:info@errandom.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  preview.hidden = false;
  preview.focus();
});

form.hidden = false;
