export function createSubmitLock() {
  let locked = false;

  return {
    tryStart() {
      if (locked) {
        return false;
      }
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
  };
}
