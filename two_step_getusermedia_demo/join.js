const logElement = document.querySelector('#log');

function log(message) {
  const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`;
  logElement.textContent += `${line}\n`;
  console.log(line);
}

log(`Join 页面已加载，origin=${location.origin}`);
log(`href=${location.href}`);
log(`visibility=${document.visibilityState}, focus=${document.hasFocus()}`);

document.querySelector('#join').onclick = () => {
  const nextUrl = `./preview.html?from=join&joinTime=${Date.now()}`;
  log(`点击 Join，开始真实页面跳转：${nextUrl}`);
  location.href = nextUrl;
};

document.querySelector('#manual').onclick = () => {
  const nextUrl = `./preview.html?from=join&auto=0&joinTime=${Date.now()}`;
  log(`进入手动测试页面：${nextUrl}`);
  location.href = nextUrl;
};
