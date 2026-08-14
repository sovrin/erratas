var e = class {
  table = null
  create(t) {
    let a = { email: t.email.trim().toLowerCase() }
    return this.table.insert(a)
  }
}
function r(n) {
  return new e().create({ email: n })
}
export { e as UserRepository, r as storeUser }
//# sourceMappingURL=broken.js.map
