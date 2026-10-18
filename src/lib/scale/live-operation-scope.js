export function isLiveOperationReceipt(receipt, { departmentId, workstationId } = {}) {
  return Boolean(departmentId && workstationId
    && receipt?.departmentId === departmentId
    && receipt?.metadata?.weightSource === "serial-live"
    && receipt?.metadata?.workstationId === workstationId);
}
