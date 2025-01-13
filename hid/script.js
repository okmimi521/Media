console.log = text => {
  log.textContent += `${text}\r\n`;
};

const waitFor = duration => new Promise(r => setTimeout(r, duration));

let device;

if (!("hid" in navigator)) {
  console.log("WebHID is not available yet.");
}

navigator.hid.getDevices().then(devices => {
  if (devices.length == 0) {
    console.log(`No HID devices selected. Press the "request device" button.`);
    return;
  }
  device = devices[0];
  console.log(`User previously selected "${device.productName}" HID device.`);
  console.log(`Now press "open device" button to be able to send reports.`);
});

requestDeviceButton.onclick = async event => {
  if (window.self !== window.top) {
    window.open(location.href, "", "noopener,noreferrer");
    return;
  }
  document.body.style.display = "none";

  try {
    // Prompt user to select an Telephony device.
    // From https://usb.org/document-library/hid-usage-tables-15
    [device] = await navigator.hid.requestDevice({
      filters: [{ usagePage: 0x0b }]
    });
    if (!device) return;

    console.log(`User selected "${device.productName}" HID device.`);
    console.log(`Now press "open device" button to be able to send reports.`);
  } finally {
    document.body.style.display = "";
  }
};

openButton.onclick = async event => {
  if (!device) return;

  await device.open();
};
