import { getCookie, dimBackground, undimBackground, removeModal, moment } from './util.js';
const grid = document.getElementById('grid');
const banModal = document.getElementById('ban-modal');
const banModalUsername = document.getElementById('ban-modal-username');

const unbanModal = document.getElementById('unban-modal');
const unbanModalUsername = document.getElementById('unban-modal-username');
const unbanModalReason = document.getElementById('unban-modal-reason');
const unbanModalExpires = document.getElementById('unban-modal-expires');

const token = getCookie('token');
if (!token) window.location.href = '/login';

async function loadUsers() {
  const req = await fetch('/users-admin', {
    headers: {
      Authorization: token
    }
  }).catch(() => {
    alert('Failed to fetch users. Try refreshing your page.');
  });

  if (!req.ok) return alert('Failed to fetch users.');

  const users = await req.json();

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const li = document.createElement('li');
    li.setAttribute('data-id', user.id);
    if (i % 2 === 1) li.classList.add('light');

    const img = document.createElement('img');
    img.src = `/avatars/${user.id}`;

    const span = document.createElement('span');
    span.innerHTML = user.username;
    if (user.admin) span.classList.add('admin');

    const button = document.createElement('button');
    switch (user.state) {
      case 'Waitlist':
        button.classList.add('whitelist-btn');
        button.innerHTML = 'Whitelist';
        break;
      case 'Active':
        button.classList.add('ban-btn');
        button.innerHTML = 'Ban';
        break;
      case 'Suspended':
        button.classList.add('unban-btn');
        button.innerHTML = 'Unban';

        li.setAttribute('data-ban-reason', user.suspended_reason);
        li.setAttribute('data-ban-expires', user.suspended_until);
        break;
      default:
        button.innerHTML = '?';
    }

    li.append(img, span, button);
    grid.appendChild(li);
  }
}

loadUsers();

let banUserId;
let clickedButton;

document.addEventListener('click', async e => {
  if (e.target.tagName !== 'BUTTON' || !e.target.parentNode.getAttribute('data-id')) return;
  const button = e.target;

  const action = button.innerHTML.toLowerCase();
  const userId = button.parentNode.getAttribute('data-id');
  const username = button.parentNode.children[1].innerHTML;

  banUserId = userId;
  clickedButton = button;

  switch (action) {
    case 'whitelist': {
      const req = await fetch(`/users-admin/${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          state: 'Active'
        })
      }).catch(() => {
        alert('Failed to whitelist user. Try refreshing your page.');
      });

      if (!req.ok) return alert('Failed to whitelist user.');

      button.className = 'ban-btn';
      button.innerHTML = 'Ban';

      alert('User whitelisted.');
      break;
    }
    case 'ban':
      banModalUsername.innerHTML = username;
      banModal.classList.remove('d-none');
      dimBackground(grid);
      break;
    case 'unban':
      unbanModalReason.innerHTML = e.target.parentNode.getAttribute('data-ban-reason');
      const banExpires = e.target.parentNode.getAttribute('data-ban-expires');
      unbanModalExpires.innerHTML = banExpires === 'null' ? 'Never' : moment(new Date(banExpires));

      unbanModalUsername.innerHTML = username;
      unbanModal.classList.remove('d-none');
      dimBackground(grid);
      break;
  }
});

const cancelBan = document.getElementById('cancel-ban');
const cancelUnban = document.getElementById('cancel-unban');

cancelBan.addEventListener('click', () => {
  removeModal(banModal);
  undimBackground(grid);
});

cancelUnban.addEventListener('click', () => {
  removeModal(unbanModal);
  undimBackground(grid);
});

const banButton = document.getElementById('ban');
const banReason = document.getElementById('ban-modal-reason');
const banDuration = document.getElementById('ban-modal-duration');
const banError = document.getElementById('ban-user-error');

const unbanButton = document.getElementById('unban');

banButton.addEventListener('click', async () => {
  const req = await fetch(`/users-admin/${banUserId}`, {
    method: 'PATCH',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      state: 'Suspended',
      suspended_reason: banReason.value,
      suspended_until: banDuration.value.length > 0 ? `[${banDuration.value}]` : null // [duration] is encoding for the current date + calculate milliseconds from string duration
    })
  }).catch(() => {
    alert('Failed to ban user. Try refreshing your page.');
  });

  const res = await req.json();
  if (!req.ok) {
    banError.innerHTML = res.message;
    return;
  }

  clickedButton.className = 'unban-btn';
  clickedButton.innerHTML = 'Unban';

  clickedButton.parentNode.setAttribute('data-ban-reason', banReason.value);
  if (res.suspended_until) clickedButton.parentNode.setAttribute('data-ban-expires', new Date(res.suspended_until).toISOString());

  removeModal(banModal);
  undimBackground(grid);
  alert('User banned.');
});

unbanButton.addEventListener('click', async () => {
  const req = await fetch(`/users-admin/${banUserId}`, {
    method: 'PATCH',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      state: 'Active'
    })
  }).catch(() => {
    alert('Failed to unban user. Try refreshing your page.');
  });

  if (!req.ok) {
    const res = await req.json();
    banError.innerHTML = res.message;
    return;
  }

  clickedButton.className = 'ban-btn';
  clickedButton.innerHTML = 'Ban';

  removeModal(unbanModal);
  undimBackground(grid);
  alert('User unbanned.');
});
