import { moment, snowflakeDate, encodeHtml, isMobile, scrollBottom, getCookie, sleep, decodeHtml } from './util.js';
import { Opcodes, CloseCodes, EventTypes, HttpStatusCodes } from './constants.js';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

export const messagesContainer = document.getElementById('messages');
const onlineList = document.getElementById('online-list');
const offlineList = document.getElementById('offline-list');

const token = getCookie('token');
if (!token) window.location.href = '/login';

/**
 * @typedef {{ id: string, username: string, admin: boolean }} User
 * @typedef {{ id: string, content: string, author: User }} Message
 */

/**
 * @type {User}
 */
let me;
// when a user updates their avatar, their avatar URLs must use a timestamp due to caching
const userAvatarUpdateTimestamps = new Map();
let heartbeatInterval;
let updateTypingInterval;

connect();
function connect() {
  let ws = new WebSocket(`${wsProtocol}//${location.host}`);

  ws.onopen = () => {
    console.log('Connected.');
    ws.send(JSON.stringify({ op: Opcodes.Identify, d: { authorization: token } }));

    // start heartbeat interval to maintain connection
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    heartbeatInterval = setInterval(() => {
      ws.send(JSON.stringify({ op: Opcodes.Heartbeat }));
    }, 20000);
  };

  // username: time typing began
  const typingUsers = new Map();

  const typingUsersElement = document.getElementById('typing-users');
  const typingBeConjugation = document.getElementById('typing-be-conjugation');
  const typingDots = document.getElementById('typing-dots');

  function updateTyping() {
    const now = Date.now();
    for (const [username, time] of typingUsers.entries()) if (now - time > 3000) typingUsers.delete(username);

    if (typingUsers.size === 0) {
      const spans = document.querySelectorAll(`#typing-indicators > span`);
      spans.forEach(span => (span.style.display = 'none'));
    } else {
      const spans = document.querySelectorAll(`#typing-indicators > span`);
      spans.forEach(span => (span.style.display = 'contents'));

      if (typingUsers.size === 1) typingBeConjugation.innerHTML = 'is';
      else typingBeConjugation.innerHTML = 'are';

      if (typingUsers.size > 3) typingUsersElement.innerHTML = `<span>${typingUsers.size}</span> people`;
      else
        typingUsersElement.innerHTML = [...typingUsers.keys()]
          .sort((a, b) => a.localeCompare(b))
          .map(username => `<span>${username}</span>`)
          .join(typingUsers.size > 2 ? ', ' : ' and ');
    }

    const dotCount = typingDots.innerHTML.length;
    if (dotCount === 3) typingDots.innerHTML = '';
    else typingDots.innerHTML += '.';
  }

  if (updateTypingInterval) clearInterval(updateTypingInterval);
  updateTypingInterval = setInterval(updateTyping, 250);

  ws.onmessage = async message => {
    /**
     * @type {{ op: number, d?: any, t?: number }}
     */
    const data = JSON.parse(message.data);

    if (data.op !== Opcodes.Dispatch || (!data.t && typeof data.t !== 'number')) return;
    const payload = data.d;

    switch (data.t) {
      case EventTypes.Ready: {
        me = payload;
        onConnect();
        break;
      }
      case EventTypes.PresenceUpdate: {
        if (!me) return;
        const { id, new_presence } = payload;
        if (id === me.id) return;

        const li = document.querySelector(`[data-id='${id}']`);
        const username = li.children[1].innerHTML;

        const liIsOnline = li.parentNode.id === 'online-list';

        if ((new_presence === 'ONLINE' && liIsOnline) || (new_presence === 'OFFLINE' && !liIsOnline)) return;

        const moveTo = new_presence === 'ONLINE' ? onlineList : offlineList;

        // insert it alphabetically
        const beforeElement = [...moveTo.children].find(
          child => child.children[1].innerHTML.localeCompare(username) === 1
        );
        if (beforeElement) beforeElement.before(li.cloneNode(true));
        else moveTo.appendChild(li.cloneNode(true));

        li.remove();

        const onlineCountSpan = document.getElementById('online-count');
        const offlineCountSpan = document.getElementById('offline-count');

        if (new_presence === 'ONLINE') {
          onlineCountSpan.innerHTML = +onlineCountSpan.innerHTML + 1;
          offlineCountSpan.innerHTML = +offlineCountSpan.innerHTML - 1;
        } else {
          onlineCountSpan.innerHTML = +onlineCountSpan.innerHTML - 1;
          offlineCountSpan.innerHTML = +offlineCountSpan.innerHTML + 1;
        }

        break;
      }
      case EventTypes.UserUpdate: {
        const { id, created, username, avatar } = payload;

        if (!created) {
          const elements = document.querySelectorAll(`[data-author='${id}'`);

          if (username) {
            const li = document.querySelector(`[data-id='${id}']`);
            li.children[1].innerHTML = payload.username;

            elements.forEach(msg => (msg.children[1].children[0].innerHTML = payload.username));
          }

          if (avatar) {
            const timestampDate = Date.now();
            userAvatarUpdateTimestamps.set(id, timestampDate);

            const newURL = `/avatars/${id}?timestamp=${timestampDate}`;
            elements.forEach(msg => (msg.children[0].src = newURL));

            document.querySelector(`[data-id='${id}']`).children[0].src = newURL;

            if (id === me.id) document.getElementById('me-avatar').src = newURL;
          }
        } else {
          const offlineList = document.getElementById('offline-list');
          const offlineCountSpan = document.getElementById('offline-count');

          const li = document.createElement('li');
          li.setAttribute('data-id', id);

          const img = document.createElement('img');
          img.src = '/default_pfp';

          const p = document.createElement('p');
          p.innerHTML = username;

          li.append(img, p);
          const beforeElement = [...offlineList.children].find(
            child => child.children[1].innerHTML.localeCompare(username) === 1
          );
          if (beforeElement) beforeElement.before(li);
          else beforeElement.appendChild(li);
          offlineCountSpan.innerHTML = +offlineCountSpan.innerHTML + 1;
        }

        break;
      }
      case EventTypes.MessageCreate: {
        const atBottomOfMessages =
          messagesContainer.scrollTop + messagesContainer.clientHeight === messagesContainer.scrollHeight;
        onMessageCreate(payload);
        if (atBottomOfMessages) scrollBottom(messagesContainer);

        if (typingUsers.delete(payload.author.username));
        updateTyping();
        break;
      }
      case EventTypes.MessageDelete: {
        const message = document.querySelector(`[data-id="${payload.id}"]`);
        if (!message) return;

        const messageGroup = message.parentNode;
        // username, timestamp, and the one message
        if (messageGroup.children.length === 3) messageGroup.parentNode.remove();
        else {
          message.remove();
          messageGroup.children[2].classList.add('first');
        }

        break;
      }
      case EventTypes.MessageEdit: {
        const message = document.querySelector(`[data-id="${payload.id}"]`);
        if (!message) return;

        const atBottomOfMessages =
          messagesContainer.scrollTop + messagesContainer.clientHeight === messagesContainer.scrollHeight;
        message.innerHTML = format(encodeHtml(payload.content));
        if (atBottomOfMessages) scrollBottom(messagesContainer);

        break;
      }
      case EventTypes.TypingStart: {
        if (payload.username === me.username) return;
        typingUsers.set(payload.username, Date.now());
        updateTyping();

        break;
      }
    }
  };

  const noReconnectCodes = [CloseCodes.Forced, CloseCodes.Forbidden, CloseCodes.AuthenticationFailed];
  ws.onclose = e => {
    console.log(e);

    if (e.code === CloseCodes.Forced) return (window.location.href = '/');
    if (noReconnectCodes.includes(e.code)) return (window.location.href = '/');

    setTimeout(() => {
      connect();
    }, 5000);
  };
}

/**
 *
 * @param {Message} message The message object
 * @param {*} reference The message above where the message is to be inserted. Used to determine if the message can be stacked
 * @param {*} topMsg If loading new messages above the previously loaded messages, all new messages are placed before this node.
 * @returns
 */
function onMessageCreate(message, reference, topMsg) {
  let lastLi;
  if (!reference) lastLi = messagesContainer.children[messagesContainer.children.length - 1];
  else if (reference !== 'first') lastLi = reference;

  message.content = format(encodeHtml(message.content));
  const youAreTaggedReg = new RegExp(`<span class="tag (admin)?">@${me.username}</span>`);
  const youAreTagged = youAreTaggedReg.test(message.content);

  if (lastLi && message.author.id === lastLi.getAttribute('data-author')) {
    // stack the messages
    const p = document.createElement('p');
    p.className = 'content';
    p.innerHTML = message.content;
    p.setAttribute('data-id', message.id);
    if (youAreTagged) p.classList.add('highlight');
    lastLi.children[1].appendChild(p);
    return;
  }

  const li = document.createElement('li');
  li.setAttribute('data-author', message.author.id);

  const img = new Image();
  const avatarUpdateTimestamp = userAvatarUpdateTimestamps.get(message.author.id);

  if (!avatarUpdateTimestamp) img.src = `/avatars/${message.author.id}`;
  else img.src = `/avatars/${message.author.id}?timestamp=${avatarUpdateTimestamp}`;

  img.className = 'avatar';

  const div = document.createElement('div');
  div.classList.add('content-group');
  const username = document.createElement('span');
  username.innerHTML = `${message.author.username}`;
  username.classList.add('username');

  if (message.author.admin) username.classList.add('admin');

  const timestamp = document.createElement('span');
  timestamp.innerHTML = moment(snowflakeDate(message.id));
  timestamp.classList.add('timestamp');

  const p = document.createElement('p');
  p.innerHTML = message.content;
  p.className = 'first content';
  p.setAttribute('data-id', message.id);
  if (youAreTagged) p.classList.add('highlight');

  div.append(username, timestamp, p);
  li.append(img, div);

  if (!reference) messagesContainer.appendChild(li);
  else {
    if (reference === 'first') messagesContainer.prepend(li);
    else topMsg.before(li);
  }
}

const urlReg = /https?:\/\/(?:[A-z0-9](?:[A-z0-9-]{0,61}[A-z0-9])?\.)+[A-z0-9][A-z0-9-]{0,61}[^ ]*/g;
// ; = keep escape character, ] = do not keep.
const escapeChars = {
  backslash: `\u200C${'\\'.charCodeAt(0)};`,
  underline: `\u200C${'_'.charCodeAt(0)}]`
}

/**
 * Format a message
 * @param {string} content
 */
function format(content) {
  // links
  // underlines have to be escaped to prevent the following formatters from formatting the URL.
  content = content.replace(urlReg, match => {
    match = match.replaceAll('_', escapeChars.underline);
    match = match.replaceAll('\\', '/');
    return `<a class="link" target="${escapeChars.underline}blank" href="${match}">${match.replaceAll('_', escapeChars.underline)}</a>`;
  });

  // encoding to turn two backslashes (\\) into escape character + b (for backslash)
  // used to support the following regex
  content = content.replaceAll('\\\\', escapeChars.backslash);

  // now due to the previous regex, \\_ can be ignored
  content = content.replace(/(?<!\\)\\./g, match => {
    const encoding = match.charCodeAt(1);
    return `\u200C${encoding};`;
  });

  // bold
  content = content.replace(/\*\*[^*]{1,}\*\*/g, match => `<b>${match.slice(2, -2)}</b>`);
  // underline
  content = content.replace(/__[^_]{1,}__/g, match => `<u>${match.slice(2, -2)}</u>`);
  // italic
  content = content.replace(/_[^_]{1,}_/g, match => `<i>${match.slice(1, -1)}</i>`);
  // tags
  content = content.replace(/@[^ ]{1,}/g, match => {
    // check if tag is real user
    const username = match.slice(1);
    const usernameElement = [...onlineList.children, ...offlineList.children].find(
      c => c.children[1].innerHTML === username
    );

    if (!usernameElement) return match;

    return `<span class="tag ${
      usernameElement.children[1].classList.contains('admin') ? 'admin' : ''
    }">${match}</span>`;
  });

  // now decode the encodings made before
  // keep the escape character so it can be unformatted with the backslash.
  // ; = keep escape character, ] = do not keep.
  content = content.replace(/\u200C[0-9]{1,}(;|])/g, match => {
    const char = String.fromCharCode(match.slice(1, -1));
    if (match.endsWith(']')) return char;
    return `\u200C${char}`;
  });

  return content;
}

const tagToFmtWrapper = Object.entries({
  a: '',
  span: '',
  b: '**',
  u: '__',
  i: '_'
});
/**
 * Revert HTML to the formatting used to get that HTML
 * @param {string} html
 */
function unformat(html) {
  html = html.replaceAll('<br>', '\n');

  for (const [tag, wrapper] of tagToFmtWrapper) {
    const regex = new RegExp(`<${tag}[^>]*>[^>]*<\/${tag}>`, 'g');
    html = html.replace(
      regex,
      match => `${wrapper}${match.slice(match.indexOf('>') + 1, match.lastIndexOf('<'))}${wrapper}`
    );
  }

  html = html.replaceAll('\u200C', '\\');

  return html;
}

// load users and messages
async function onConnect() {
  const meAvatar = document.getElementById('me-avatar');
  const meUsername = document.getElementById('me-username');

  meAvatar.src = `/avatars/${me.id}`;
  meUsername.innerHTML = me.username;
  if (me.admin) meUsername.classList.add('admin');

  const usersReq = await fetch('/users', {
    headers: {
      authorization: token
    }
  });

  /**
   * @type {(User & { online: boolean })[]}
   */
  const users = await usersReq.json();

  if (!usersReq.ok) return console.log(users);

  const onlineCountSpan = document.getElementById('online-count');
  const offlineCountSpan = document.getElementById('offline-count');

  onlineList.innerHTML = '';
  offlineList.innerHTML = '';

  let offlineCount = 0,
    onlineCount = 0;

  for (const user of users) {
    const li = document.createElement('li');
    li.setAttribute('data-id', user.id);

    const img = document.createElement('img');
    img.src = `/avatars/${user.id}`;

    const p = document.createElement('p');
    p.innerHTML = user.username;
    if (user.admin) p.classList.add('admin');

    li.append(img, p);

    if (user.online) {
      onlineList.appendChild(li);
      onlineCount++;
    } else {
      offlineList.appendChild(li);
      offlineCount++;
    }
  }

  onlineCountSpan.innerHTML = onlineCount;
  offlineCountSpan.innerHTML = offlineCount;

  // MESSAGES

  const messagesReq = await fetch('/messages', {
    headers: {
      authorization: token
    }
  });

  const messages = await messagesReq.json();

  if (!messagesReq.ok) return console.log(messages);

  for (const msg of messages) onMessageCreate(msg);

  if (me.admin) document.getElementById('delete-message-option').style.display = 'block';
  if (isMobile()) {
    const messageOptions = document.getElementById('message-options');
    messageOptions.style.width = '90%';

    document.getElementById('cancel-message-option').classList.remove('d-none');
  }

  scrollBottom(messagesContainer);
}

let waitLoadMore = false;
const downArrow = document.getElementById('down-arrow');
messagesContainer.addEventListener('scroll', async () => {
  if (messagesContainer.scrollTop < 0) return messagesContainer.scrollTo(0, 0);

  if (messagesContainer.scrollTop + messagesContainer.clientHeight >= messagesContainer.scrollHeight) {
    downArrow.style.display = 'none';
  } else downArrow.style.display = 'block';

  if (waitLoadMore || messagesContainer.scrollTop > 0) return;
  // msgs container > first li > body (past the avatar) > message
  const topMsgId = messagesContainer?.firstChild?.children[1]?.children[2]?.getAttribute('data-id');
  if (!topMsgId) return;

  waitLoadMore = true;

  const messagesReq = await fetch(`/messages?before=${topMsgId}`, {
    headers: {
      authorization: token
    }
  });

  const messages = await messagesReq.json();

  if (!messagesReq.ok) return console.log(messages);

  if (messages.length === 0) return;

  const beforeScrollHeight = messagesContainer.scrollHeight;

  const topMsg = messagesContainer.firstChild;
  onMessageCreate(messages[0], 'first');
  for (let i = 1; i < messages.length; i++) {
    const refMessage = topMsg.previousSibling;
    onMessageCreate(messages[i], refMessage, topMsg);
  }

  messagesContainer.scrollTo(0, messagesContainer.scrollHeight - beforeScrollHeight);

  waitLoadMore = false;
});

downArrow.addEventListener('click', async () => {
  messagesContainer.scrollTo(
    0,
    Math.max(messagesContainer.scrollTop + messagesContainer.clientHeight, messagesContainer.scrollHeight - 10000)
  );

  // Used to check if the user scrolled during the animation, and if they did, cancel the scroll animation
  let lastScrollPos = 0;
  while (true) {
    const distance = messagesContainer.scrollHeight - (messagesContainer.scrollTop + messagesContainer.clientHeight);
    if (distance === 0) break;

    if (lastScrollPos && messagesContainer.scrollTop !== lastScrollPos) break;

    messagesContainer.scrollTo(0, messagesContainer.scrollTop + 100);
    lastScrollPos = messagesContainer.scrollTop;
    await sleep(5);
  }
});

const showRightSide = document.getElementById('show-right-side');
const rightSide = document.getElementById('right-side');
showRightSide.addEventListener('click', () => {
  if (rightSide.style.display === 'block') {
    rightSide.style.display = null;
  } else {
    rightSide.style.display = 'block';
  }
});

const messageInput = document.getElementById('message-input');

function adjustMessageInputHeight() {
  const atBottomOfMessages =
    messagesContainer.scrollTop + messagesContainer.clientHeight === messagesContainer.scrollHeight;

  messageInput.style.height = 0;
  const rows = Math.min(Math.floor((messageInput.scrollHeight - 50) / 20 + 1), 10);
  messageInput.rows = rows;
  messageInput.style.height = 'auto';

  if (atBottomOfMessages) scrollBottom(messagesContainer);

  if (messageInput.scrollTop + messageInput.clientHeight - messageInput.scrollHeight <= 20) scrollBottom(messageInput);
}

let selectedMessage = null;
let editingMessage = null;

let lastTypingIndicatorSentAt = 0;
messageInput.addEventListener('input', () => {
  adjustMessageInputHeight();

  if (editingMessage) return;
  // typing indicators
  if (messageInput.value.length === 0 || Date.now() - lastTypingIndicatorSentAt < 2000) return;
  fetch('/typing', {
    method: 'POST',
    headers: {
      Authorization: token
    }
  });

  lastTypingIndicatorSentAt = Date.now();
});

messageInput.addEventListener('paste', e => {
  e.preventDefault();
  const text = (e.originalEvent || e).clipboardData.getData('text/plain');
  // deprecated but who cares
  document.execCommand('insertText', false, text);
});

messageInput.addEventListener('keydown', e => {
  if (e.key != 'Enter' || e.shiftKey) return;
  // if mobile:
  if (isMobile()) return;

  e.preventDefault();
  return sendMessage();
});

// when a key is pressed, focus on the message input
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  if (messageInput !== document.activeElement) messageInput.focus();
});

const messageOptions = document.getElementById('message-options');
const editMessageOption = document.getElementById('edit-message-option');
const deleteMessageOption = document.getElementById('delete-message-option');
const editingAlert = document.getElementById('editing-alert');
const exitEditingBtn = document.getElementById('exit-editing');

document.addEventListener('click', e => {
  if (!isMobile()) {
    selectedMessage = null;
    messageOptions.style.display = 'none';
  }
});

let lastTouch = 0;
let lastTouchElement = null;
messagesContainer.addEventListener('touchstart', async e => {
  if (!e.target.classList.contains('content')) return;
  if (e.target != lastTouchElement || Date.now() - lastTouch > 500) {
    lastTouchElement = e.target;
    lastTouch = Date.now();
    return;
  }

  e.preventDefault();

  selectedMessage = e.target;
  if (selectedMessage.parentNode.parentNode.getAttribute('data-author') === me.id)
    editMessageOption.style.display = 'block';
  else editMessageOption.style.display = 'none';

  if (me.admin || selectedMessage.parentNode.parentNode.getAttribute('data-author') === me.id)
    deleteMessageOption.style.display = 'block';
  else deleteMessageOption.style.display = 'none';

  messageOptions.style.display = 'block';

  // animate it going up
  // helps prevent misclicking when the overlay is immediately placed over where you clicked.
  messageOptions.style.bottom = '-200px';

  for (let i = -200; i <= 20; i += 6) {
    messageOptions.style.bottom = i + 'px';
    await sleep(1);
  }
});

messagesContainer.addEventListener('contextmenu', e => {
  if (!e.target.classList.contains('content')) return;
  e.preventDefault();

  selectedMessage = e.target;
  if (selectedMessage.parentNode.parentNode.getAttribute('data-author') === me.id)
    editMessageOption.style.display = 'block';
  else editMessageOption.style.display = 'none';

  if (me.admin || selectedMessage.parentNode.parentNode.getAttribute('data-author') === me.id)
    deleteMessageOption.style.display = 'block';
  else deleteMessageOption.style.display = 'none';

  messageOptions.style.display = 'block';
  messageOptions.style.top = Math.min(e.y, window.innerHeight - messageOptions.style.height - 150) + 'px';
  messageOptions.style.left = e.x + messageOptions.offsetWidth / 2 + 'px';
});

messageOptions.addEventListener('click', async e => {
  const button = e.target.innerHTML.toLowerCase();

  if (!selectedMessage) return;

  switch (button) {
    case 'delete':
      const req = await fetch(`/messages/${selectedMessage.getAttribute('data-id')}`, {
        method: 'DELETE',
        headers: {
          Authorization: token
        }
      }).catch(() => {
        alert('Failed to delete message. Try refreshing your page.');
      });

      if (!req.ok) alert('Failed to delete message.');

      break;
    case 'edit':
      messageInput.setAttribute('placeholder', 'Editing...');
      messageInput.value = decodeHtml(unformat(selectedMessage.innerHTML));
      messageInput.focus();
      messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
      adjustMessageInputHeight();
      editingMessage = selectedMessage;
      editingMessage.style.backgroundColor = '#141422';

      editingAlert.classList.remove('d-none');
      break;
    case 'copy text':
      const textArea = document.createElement('textarea');
      textArea.value = decodeHtml(unformat(selectedMessage.innerHTML));
      textArea.style.position = 'fixed'; // Ensure it's not visible
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      break;
    case 'reply':
      const username = selectedMessage.parentNode.children[0].innerHTML;
      messageInput.value = `> ___${decodeHtml(
        unformat(selectedMessage.innerHTML).replaceAll('_', '\\_')
      )}___\n@${username} `;
      messageInput.focus();
      messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
      adjustMessageInputHeight();
      break;
    case 'cancel':
      break;
  }

  messageOptions.style.display = 'none';
});

exitEditingBtn.addEventListener('click', () => {
  editingMessage.style.backgroundColor = null;
  editingMessage = null;
  editingAlert.classList.add('d-none');
  messageInput.value = '';
  messageInput.setAttribute('placeholder', 'Message...');
  adjustMessageInputHeight();
});

const sendBtn = document.getElementById('send-btn');
sendBtn.addEventListener('click', () => {
  sendMessage();
  messageInput.focus();
});

async function sendMessage() {
  const content = messageInput.value.trim();
  if (content.length === 0) return;
  if (content.length > 2000) return alert('Message exceeds 2000 character limit.');

  const messageInputValue = messageInput.value;
  messageInput.value = '';
  adjustMessageInputHeight();

  const resetInput = () => {
    messageInput.value = messageInputValue;
    adjustMessageInputHeight();
  };

  if (!editingMessage) {
    const req = await fetch('/messages', {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content
      })
    }).catch(() => {
      resetInput();
      alert('Failed to send message. Try refreshing your page.');
    });

    if (req.status === HttpStatusCodes.RateLimit) {
      resetInput();
      return alert('Slow down, you are sending messages too fast.');
    } else if (!req.ok) {
      try {
        const res = await req.json();
        resetInput();

        if (res.message) return alert(res.message);
        else return alert('Failed to send message.');
      } catch {
        resetInput();
        return alert('Failed to send message.');
      }
    }
  } else {
    const req = await fetch(`/messages/${editingMessage.getAttribute('data-id')}`, {
      method: 'PATCH',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content
      })
    }).catch(() => {
      resetInput();
      alert('Failed to edit message. Try refreshing your page.');
    });

    editingMessage.style.backgroundColor = null;
    editingMessage = null;
    messageInput.setAttribute('placeholder', 'Message...');
    editingAlert.classList.add('d-none');

    if (!req.ok) {
      resetInput();
      return alert('Failed to edit message.');
    }
  }
}
