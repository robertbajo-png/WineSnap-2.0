// Closing the last page need not disconnect Chromium. Preserve any other page.
export function waitForOwnedViewerClose(browser) {
  return new Promise((resolve) => {
    let timer;
    const finish = () => {
      clearInterval(timer);
      browser.off("disconnected", finish);
      resolve();
    };
    const inspect = () => {
      if (
        !browser.isConnected() ||
        browser.contexts().every((context) => context.pages().every((page) => page.isClosed()))
      )
        finish();
    };
    browser.on("disconnected", finish);
    timer = setInterval(inspect, 250);
    inspect();
  });
}
