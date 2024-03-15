import { moment } from "./util.js";

const error = document.getElementById('error');
const dateEmbedReg = /<date:([A-z0-9:\-.]{1,})>/;

export async function registerInput() {
  const username = document.getElementById('name').value.trim();
  const password = document.getElementById('password').value;

  const req = await fetch(`/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  if (!req.ok) {
    const res = await req.json();
    const embededDate = res.message.match(dateEmbedReg);
    if (embededDate) {
      const datePart = embededDate[1];
      res.message = res.message.slice(0, embededDate.index) + moment(new Date(datePart)) + res.message.slice(embededDate.index + embededDate[0].length);
    }

    error.innerHTML = res.message;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const redirectURI = params.get('redirect_uri');

  if (redirectURI) window.location.href = `/${redirectURI}`;
  else window.location.href = '/chat';
}

const form = document.getElementById('form');
form.addEventListener('submit', e => {
  e.preventDefault();
  registerInput();
})