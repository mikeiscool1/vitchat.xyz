const error = document.getElementById('error');

const throwErr = message => (error.innerHTML = message);

async function registerInput() {
  const username = document.getElementById('name').value.trim();
  const password = document.getElementById('password').value;
  const passwordConfirmation = document.getElementById('password-confirmation').value;

  if (password !== passwordConfirmation) return throwErr('Passwords do not match.');

  if (/\d{8}/.test(password)) return throwErr('Please use a different password.');

  const req = await fetch(`/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  if (!req.ok) {
    const res = await req.json();
    return throwErr(res.message);
  }

  window.location.href = '/login';
}
