/* Notification System */
/* exported showNotification */

function showNotification(message, type, duration) {
  type = type || 'info';
  duration = duration || 4000;

  var existing = document.querySelectorAll('.notification');
  existing.forEach(function(n) { n.remove(); });

  var icons = {
    success: '\u2714',
    error: '\u2718',
    warning: '\u26A0',
    info: '\u2139'
  };

  var notification = document.createElement('div');
  notification.className = 'notification ' + type;
  notification.innerHTML = '<span>' + (icons[type] || '') + '</span><span>' + message + '</span>';

  document.body.appendChild(notification);

  setTimeout(function() {
    notification.style.animation = 'fadeIn 0.3s ease reverse';
    setTimeout(function() { notification.remove(); }, 300);
  }, duration);
}
