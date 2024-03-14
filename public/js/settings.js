import { getCookie, dimBackground, undimBackground, removeModal } from './util.js';

const changeUsernameButton = document.getElementById('change-username');
const changePasswordButton = document.getElementById('change-password');
const changeAvatarButton = document.getElementById('change-avatar');
const fileInput = document.getElementById('file-input');

const usernameModal = document.getElementById('change-username-modal');
const passwordModal = document.getElementById('change-password-modal');

const otherPopupsOpened = () =>
  !usernameModal.classList.contains('d-none') || !passwordModal.classList.contains('d-none');

const container = document.getElementById('container');

changeUsernameButton.addEventListener('click', () => {
  if (otherPopupsOpened()) return;
  usernameModal.classList.remove('d-none');
  dimBackground(container);
});

changePasswordButton.addEventListener('click', () => {
  if (otherPopupsOpened()) return;
  passwordModal.classList.remove('d-none');
  dimBackground(container);
});

changeAvatarButton.addEventListener('click', () => {
  fileInput.click();
});

const cancelUsername = document.getElementById('cancel-username');
const cancelPassword = document.getElementById('cancel-password');

cancelUsername.addEventListener('click', () => {
  removeModal(usernameModal);
  undimBackground(container);
});

cancelPassword.addEventListener('click', () => {
  removeModal(passwordModal);
  undimBackground(container);
});

const newUsername = document.getElementById('new-username');
const newUsernamePassword = document.getElementById('new-username-password');

const newPasswordOld = document.getElementById('new-password-old-password');
const newPasswordNew = document.getElementById('new-password-new-password');
const newPasswordConfirm = document.getElementById('new-password-confirm-password');

const updateUsername = document.getElementById('update-username');
const updatePassword = document.getElementById('update-password');

const changeUsernameError = document.getElementById('change-username-error');
const changePasswordError = document.getElementById('change-password-error');

// at this point do these names make any sense?
const userUsername = document.getElementById('user-username');
const userAvatar = document.getElementById('user-avatar');

const userId = getCookie('id');
const token = getCookie('token');

// not redirected to /login because the user may be logged in (has proper token, but not id)
// so ensure they are logged out first so they can re log in and get all the proper cookies.
if (!userId) window.location.href = '/logout';
if (!token) window.location.href = '/login';

async function getUser() {
  const req = await fetch(`/users/${userId}`, {
    headers: {
      Authorization: token
    }
  }).catch(() => {
    alert('Failed to fetch user settings.');
  });

  const user = await req.json();

  userUsername.innerHTML = user.username;
  userAvatar.src = `/avatars/${userId}`;

  if (user.admin) userUsername.classList.add('admin');
}

getUser();

updateUsername.addEventListener('click', async () => {
  const username = newUsername.value.trim();
  const password = newUsernamePassword.value;
  if (username.length === 0) return (changeUsernameError.innerHTML = 'New Username field is required.');

  const req = await fetch(`/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      password,
      username
    })
  }).catch(() => {
    alert('Failed to update user settings. Try refreshing your page.');
  });

  if (!req.ok) {
    const res = await req.json().catch(() => ({ message: 'An error occoured.' }));
    return (changeUsernameError.innerHTML = res.message);
  }

  userUsername.innerHTML = username;

  removeModal(usernameModal);
  undimBackground(container);
  alert('Username updated.');
});

updatePassword.addEventListener('click', async () => {
  const oldPassword = newPasswordOld.value;
  const newPassword = newPasswordNew.value;
  const confirmPassword = newPasswordConfirm.value;

  if (newPassword.length === 0) return (changePasswordError.innerHTML = 'New Password field is required.');
  if (newPassword !== confirmPassword) return (changePasswordError.innerHTML = 'Passwords do not match.');

  const req = await fetch(`/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      password: oldPassword,
      new_password: newPassword
    })
  }).catch(() => {
    alert('Failed to update user settings. Try refreshing your page.');
  });

  if (!req.ok) {
    const res = await req.json().catch(() => ({ message: 'An error occoured.' }));
    return (changePasswordError.innerHTML = res.message);
  }

  removeModal(passwordModal);
  undimBackground(container);
  alert('Password updated.');
});

fileInput.addEventListener('change', e => {
  if (fileInput.files.length > 1) return alert('Do not submit multiple files.');

  const file = fileInput.files[0];

  const reader = new FileReader();
  reader.readAsDataURL(file);

  reader.onload = async function (e) {
    const dataURL = e.target.result;

    const formData = new FormData();
    formData.append('file', dataURL);
    formData.append('type', file.type);
    const req = await fetch(`/avatars/${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: token
      },
      body: formData
    }).catch(() => {
      alert('Failed to set avatar. Try refreshing your page.');
    });

    if (!req.ok) {
      const res = await req.json();
      return alert(res.message);
    }

    userAvatar.src = dataURL;
    alert('Avatar updated.');
  };
});
