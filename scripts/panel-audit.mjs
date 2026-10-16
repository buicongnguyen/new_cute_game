/** Audit every laid-out control and text node, including content below the fold. */
export async function auditPanel(page) {
  return page.locator('.sheet').evaluate(root => {
    const failures = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
      const style = getComputedStyle(el), box = el.getBoundingClientRect();
      const ownText = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      const scale = el instanceof SVGGraphicsElement ? Math.hypot(el.getScreenCTM()?.a ?? 1, el.getScreenCTM()?.b ?? 0) : 1;
      if (ownText && parseFloat(style.fontSize) * scale < 10.99) failures.push('Small text: ' + el.textContent.slice(0, 65) + ' (' + (parseFloat(style.fontSize) * scale).toFixed(2) + 'px)');
      if (el.matches('button,input,textarea,select,[role="button"]') && (box.width < 43.99 || box.height < 43.99)) failures.push('Small target: ' + (el.textContent || el.getAttribute('aria-label')).slice(0, 60) + ' (' + box.width.toFixed(1) + '×' + box.height.toFixed(1) + ')');
    }
    const body = root.querySelector('.body');
    if (body.scrollWidth > body.clientWidth + 1) failures.push('Horizontal overflow');
    return failures;
  });
}
