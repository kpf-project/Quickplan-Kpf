export function observeReportRequest(promise, onSuccess, onError) {
  let active = true;
  Promise.resolve(promise).then(
    (value) => { if (active) onSuccess(value); },
    (error) => { if (active) onError(error); },
  );
  return () => { active = false; };
}

export function afterReportPaint(host = window) {
  return new Promise((resolve) => {
    if (host.document?.hidden || !host.requestAnimationFrame) host.setTimeout(resolve, 0);
    else host.requestAnimationFrame(() => host.setTimeout(resolve, 0));
  });
}
