const logElement = document.querySelector('#log');

function log(message) {
  const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`;
  logElement.textContent += `${line}\n`;
  console.log(line);
}

log(`Join 页面已加载，origin=${location.origin}`);
log(`href=${location.href}`);
log(`visibility=${document.visibilityState}, focus=${document.hasFocus()}`);

document.querySelector('#join').addEventListener('click', event => {
  log('点击 Join，跳转到 Preview 页面');
  location.href = './preview.html?from=join';
});

document.querySelector('#manual').addEventListener('click', event => {
  log('进入手动测试页面，不自动请求权限');
  location.href = './preview.html?from=join&auto=0';
});
