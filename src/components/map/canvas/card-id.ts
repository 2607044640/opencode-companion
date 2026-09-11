export function newCardId(): string {
  return `tm_${crypto.randomUUID().replaceAll("-", "")}`
}

export function newGroupId(): string {
  return `grp_${crypto.randomUUID().replaceAll("-", "")}`
}
