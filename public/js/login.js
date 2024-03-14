const error = document.getElementById('error');

async function registerInput() {
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
    error.innerHTML = res.message;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const redirectURI = params.get('redirect_uri');

  if (redirectURI) window.location.href = `/${redirectURI}`;
  else window.location.href = '/chat';
}
