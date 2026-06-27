const storageKey = "tbd-simple-billing";

const defaults = {
  activeCompanyId: "company-1",
  companies: [{ id: "company-1", name: "TBD Books", logo: "", signature: "", gstin: "", phone: "", address: { line1: "", line2: "", city: "", state: "Tamil Nadu", pincode: "" }, bank: { name: "", accountHolder: "", accountNumber: "", ifscCode: "" }, terms: "Thanks for doing business with us." }],
  parties: [], invoices: [], quotes: [], transactions: [],
  settings: { invoicePrefix: "INV", quotePrefix: "EST", currency: "Rs." }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let editingCompanyId = null;
let editingPartyId = null;
let editingDocument = null;
let openedDocument = null;
let pendingCompanyLogo = "";
let pendingCompanySignature = "";
let state = load();
const defaultMembers = { admin: { name: "Admin", password: "123456", recoveryPhone: "" } };
function loadMembers() { try { return { ...defaultMembers, ...JSON.parse(localStorage.getItem("tbd-members") || "{}") }; } catch { return { ...defaultMembers }; } }
const members = loadMembers();
const cloudApi = "/api/state";
let cloudOnline = false;
let cloudSaveTimer = null;
let syncingCloud = false;
function saveMembers() { localStorage.setItem("tbd-members", JSON.stringify(members)); queueCloudSave(); }

async function readCloudState() {
  const response = await fetch(cloudApi, { cache: "no-store" });
  if (!response.ok) throw new Error(`Cloud API ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "Cloud API error");
  return payload;
}

async function pushCloudState() {
  const response = await fetch(cloudApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, members })
  });
  if (!response.ok) throw new Error(`Cloud save ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "Cloud save error");
}

function queueCloudSave() {
  if (!cloudOnline || syncingCloud) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    pushCloudState().catch((error) => {
      console.error(error);
      cloudOnline = false;
      toast("Cloud sync offline. Saved in this browser.");
    });
  }, 300);
}

async function initCloudSync() {
  if (location.protocol === "file:") return;
  try {
    const payload = await readCloudState();
    cloudOnline = true;
    syncingCloud = true;
    if (payload.hasData && payload.state) {
      localStorage.setItem(storageKey, JSON.stringify(payload.state));
      if (payload.members?.admin) {
        Object.keys(members).forEach((key) => delete members[key]);
        Object.assign(members, { ...defaultMembers, ...payload.members });
        localStorage.setItem("tbd-members", JSON.stringify(members));
      }
      state = load();
      renderAll();
      renderSession();
    } else {
      await pushCloudState();
    }
    syncingCloud = false;
    toast("Cloud sync connected.");
  } catch (error) {
    syncingCloud = false;
    console.warn(error);
    toast("Cloud sync offline. Saved in this browser.");
  }
}

function setSidebarCollapsed(collapsed) {
  $(".app-shell").classList.toggle("sidebar-collapsed", collapsed);
  $("#sidebarToggle").textContent = collapsed ? ">" : "<";
  $("#sidebarToggle").title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  localStorage.setItem("tbd-sidebar-collapsed", String(collapsed));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved) return structuredClone(defaults);
    const result = { ...structuredClone(defaults), ...saved, settings: { ...defaults.settings, ...saved.settings } };
    const fallbackId = result.activeCompanyId || "company-1";
    ["parties", "invoices", "quotes", "transactions"].forEach((key) => {
      result[key] = (result[key] || []).map((entry) => ({ ...entry, companyId: entry.companyId || fallbackId }));
    });
    result.parties = result.parties.map((party) => ({ ...party, address: typeof party.address === "object" ? party.address : { line1: party.address || "", line2: "", city: "", state: "Tamil Nadu", pincode: "" } }));
    result.companies = (result.companies || defaults.companies).map((company) => ({ ...company, logo: company.logo || "", signature: company.signature || "", address: typeof company.address === "object" ? company.address : { ...defaults.companies[0].address, line1: company.address || "" }, bank: { ...defaults.companies[0].bank, ...company.bank }, terms: company.terms || defaults.companies[0].terms }));
    return result;
  } catch { return structuredClone(defaults); }
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    queueCloudSave();
    return true;
  } catch (error) {
    console.error(error);
    if ($("#toast")) toast("Could not save. Logo/sign image may be too large.");
    return false;
  }
}
function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function today() { return new Date().toISOString().slice(0, 10); }
function activeCompany() { return state.companies.find((company) => company.id === state.activeCompanyId) || state.companies[0]; }
function scoped(entries) { return entries.filter((entry) => entry.companyId === state.activeCompanyId); }
function partyById(id) { return scoped(state.parties).find((party) => party.id === id); }
function partyName(id) { return partyById(id)?.name || "-"; }
function money(value) { return `${state.settings.currency} ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function ref(prefix, entries) { return `${prefix}-${String(entries.length + 1).padStart(3, "0")}`; }
function addressFrom(prefix) { return { line1: $(`#${prefix}AddressLine1`).value.trim(), line2: $(`#${prefix}AddressLine2`).value.trim(), city: $(`#${prefix}City`).value.trim(), state: $(`#${prefix}State`).value.trim(), pincode: $(`#${prefix}Pincode`).value.trim() }; }
function addressText(address = {}) { return [address.line1, address.line2, [address.city, address.state, address.pincode].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || "-"; }

function sizeArea(size) {
  const values = String(size || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(?:x|X|\*)\s*(\d+(?:\.\d+)?)/);
  return values ? Number(values[1]) * Number(values[2]) : 0;
}
function billQuantity(entry) { return entry.unit === "Sq. Feet" ? sizeArea(entry.size) * Number(entry.qty || 1) : Number(entry.qty || 0); }
function lineAmount(entry) { if (Array.isArray(entry.items)) return entry.items.reduce((sum, item) => sum + lineAmount(item), 0); return billQuantity(entry) * Number(entry.rate || 0); }
function resolvedTaxType(entry) { if (entry.taxType && entry.taxType !== "auto") return entry.taxType; const party = partyById(entry.partyId); return party?.address?.state && activeCompany().address?.state && party.address.state.trim().toLowerCase() !== activeCompany().address.state.trim().toLowerCase() ? "igst" : "cgst-sgst"; }
function taxAmounts(entry) { const base = lineAmount(entry); const totalTax = Array.isArray(entry.items) ? entry.items.reduce((sum, item) => sum + lineAmount(item) * Number(item.tax || 0) / 100, 0) : base * Number(entry.tax || 0) / 100; const type = resolvedTaxType(entry); return { base, type, cgst: type === "cgst-sgst" ? totalTax / 2 : 0, sgst: type === "cgst-sgst" ? totalTax / 2 : 0, igst: type === "igst" ? totalTax : 0, total: base + totalTax }; }
const statusOptions = { invoice: ["Unpaid", "Part Paid", "Paid", "Overdue", "Cancelled"], quote: ["Draft", "Sent", "Approved", "Rejected", "Expired"] };
const statusColors = { Unpaid: ["#ef1745", "#ff8a3d"], "Part Paid": ["#ffb23d", "#ffdf7a"], Paid: ["#2dbb91", "#6ee7b7"], Overdue: ["#b42318", "#ff7a66"], Cancelled: ["#68758e", "#a7b1c2"], Draft: ["#68758e", "#a7b1c2"], Sent: ["#0a84ff", "#64c7ff"], Approved: ["#2dbb91", "#75e6bd"], Rejected: ["#ef1745", "#ff8a3d"], Expired: ["#7c3aed", "#c4b5fd"] };
function defaultStatus(type) { return type === "invoice" ? "Unpaid" : "Draft"; }
function entryStatus(entry, type) { return entry.status || defaultStatus(type); }
function statusSlug(status) { return status.toLowerCase().replace(/\s+/g, "-"); }
function statusStyle(status) { const colors = statusColors[status] || ["#68758e", "#a7b1c2"]; return `--status-color:${colors[0]};--status-soft:${colors[1]};--status-shadow:${colors[0]}33`; }
function statusSelect(type, entry) { return `<select class="status-select" data-status-type="${type}" data-status-id="${entry.number}" aria-label="${entry.number} status">${statusOptions[type].map((status) => `<option value="${status}" ${entryStatus(entry, type) === status ? "selected" : ""}>${status}</option>`).join("")}</select>`; }
function statusSummary(entries, type) { return statusOptions[type].reduce((result, status) => ({ ...result, [status]: entries.filter((entry) => entryStatus(entry, type) === status).length }), {}); }

function toast(message) { $("#toast").textContent = message; $("#toast").classList.add("show"); setTimeout(() => $("#toast").classList.remove("show"), 1800); }
function loginError(message = "", type = "error") { $("#loginError").textContent = message; $("#loginError").className = `login-error${message ? " show" : ""}${type === "success" ? " success" : ""}${type === "info" ? " info" : ""}`; }
function activeMember() { return members[sessionStorage.getItem("tbd-active-member")] || null; }
function renderSession() { const member = activeMember(); $("#loginOverlay").classList.toggle("hidden", Boolean(member)); $("#sessionUser").textContent = member ? member.name : ""; $("#logoutButton").classList.toggle("hidden", !member); if (member) loginError(""); }
function setView(view) { $$(".view").forEach((node) => node.classList.toggle("active", node.id === `${view}View`)); $$(".nav-item, .nav-child").forEach((node) => node.classList.toggle("active", node.dataset.view === view)); $("#companyMenu").classList.remove("show"); }
function logoMarkup(company, className) { return company.logo ? `<img class="${className}" src="${company.logo}" alt="${company.name} logo">` : company.name.slice(0, 2).toUpperCase(); }
function showCompanyLogoPreview(logo) { $("#companyLogoPreview").innerHTML = logo ? `<img src="${logo}" alt="Company logo preview">` : "Add Logo"; }
function showCompanySignaturePreview(signature) { $("#companySignaturePreview").innerHTML = signature ? `<img src="${signature}" alt="Signature preview">` : "Add Sign"; }
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}
async function cleanSignatureImage(dataUrl) {
  const image = await imageFromDataUrl(dataUrl);
  const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const frame = context.getImageData(0, 0, width, height);
  const pixels = frame.data;
  const samplePoints = [[2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3], [Math.floor(width / 2), 2], [Math.floor(width / 2), height - 3]];
  const background = samplePoints.reduce((sum, [x, y]) => {
    const i = (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;
    return [sum[0] + pixels[i], sum[1] + pixels[i + 1], sum[2] + pixels[i + 2]];
  }, [0, 0, 0]).map((value) => value / samplePoints.length);
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (pixels[i + 3] < 20) {
      pixels[i + 3] = 0;
      continue;
    }
    const brightness = (r + g + b) / 3;
    const bgDistance = Math.hypot(r - background[0], g - background[1], b - background[2]);
    const blueInk = b > r + 8 && b > g + 2 && brightness < 205;
    const darkInk = brightness < 112 && Math.max(r, g, b) - Math.min(r, g, b) > 12;
    const keep = blueInk || darkInk;
    pixels[i + 3] = keep ? Math.min(255, Math.max(130, (205 - brightness) * 2.1)) : 0;
    if (pixels[i + 3]) {
      const index = i / 4;
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  context.putImageData(frame, 0, 0);
  if (minX > maxX || minY > maxY) return dataUrl;
  const padding = 8;
  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropWidth = Math.min(width - cropX, maxX - minX + padding * 2);
  const cropHeight = Math.min(height - cropY, maxY - minY + padding * 2);
  const output = document.createElement("canvas");
  output.width = cropWidth;
  output.height = cropHeight;
  output.getContext("2d").drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return output.toDataURL("image/png");
}
function resetCompanyForm() { editingCompanyId = null; pendingCompanyLogo = ""; pendingCompanySignature = ""; $("#companyFormTitle").textContent = "Add Company"; $("#companyForm").reset(); $("#companyState").value = "Tamil Nadu"; showCompanyLogoPreview(""); showCompanySignaturePreview(""); }
function resetPartyForm() { editingPartyId = null; $("#partyForm h2").textContent = "Add Party Details"; $("#partyForm").reset(); $("#partyState").value = "Tamil Nadu"; }

function clearItemRows(kind) { document.querySelectorAll(`.extra-entry-row[data-kind="${kind}"]`).forEach((row) => row.remove()); }
function setPrimaryItem(kind, item = {}) {
  $(`#${kind}Item`).value = item.item || "";
  $(`#${kind}Hsn`).value = item.hsn || "";
  $(`#${kind}Size`).value = item.size || "";
  $(`#${kind}Qty`).value = item.qty || 1;
  $(`#${kind}Unit`).value = item.unit || "Sq. Feet";
  $(`#${kind}Rate`).value = item.rate || 0;
  $(`#${kind}Tax`).value = item.tax ?? 18;
}
function resetSaleForm(kind) {
  editingDocument = editingDocument?.type === kind ? null : editingDocument;
  $(`#${kind}Form`).reset();
  clearItemRows(kind);
  setPrimaryItem(kind);
  $(`#${kind}Form .transaction-head p`).textContent = kind === "invoice" ? "Sale #" : "Estimate #";
  $(`#${kind}Form .primary[type="submit"]`).textContent = kind === "invoice" ? "Save Invoice" : "Save Estimate";
  updateSaleCalculation(kind);
}
function addItemRow(kind, item = {}) {
  const rowCount = document.querySelectorAll(`.extra-entry-row[data-kind="${kind}"]`).length + 2;
  const row = document.createElement("div");
  row.className = "entry-inputs extra-entry-row";
  row.dataset.kind = kind;
  row.innerHTML = `<span>${rowCount}</span><input data-field="item" required placeholder="Add item or service"><input data-field="hsn" placeholder="998386"><input data-field="size" placeholder="30 x 25"><input data-field="qty" type="number" min="1" value="1"><select data-field="unit"><option>Sq. Feet</option><option>Nos</option><option>Kg</option></select><input data-field="rate" type="number" min="0" value="0"><input data-field="tax" type="number" min="0" value="18"><button class="remove-row" type="button" title="Remove row">x</button>`;
  const total = $(`#${kind}Form .entry-total`);
  total.before(row);
  row.querySelector('[data-field="item"]').value = item.item || "";
  row.querySelector('[data-field="hsn"]').value = item.hsn || "";
  row.querySelector('[data-field="size"]').value = item.size || "";
  row.querySelector('[data-field="qty"]').value = item.qty || 1;
  row.querySelector('[data-field="unit"]').value = item.unit || "Sq. Feet";
  row.querySelector('[data-field="rate"]').value = item.rate || 0;
  row.querySelector('[data-field="tax"]').value = item.tax ?? 18;
  row.addEventListener("input", () => updateSaleCalculation(kind));
  row.addEventListener("change", () => updateSaleCalculation(kind));
  row.querySelector(".remove-row").addEventListener("click", () => { row.remove(); updateSaleCalculation(kind); });
  if (!item.item) row.querySelector('[data-field="item"]').focus();
  updateSaleCalculation(kind);
}
function startEditDocument(type, number) {
  const kind = type === "invoice" ? "invoice" : "quote";
  const entry = scoped(type === "invoice" ? state.invoices : state.quotes).find((record) => record.number === number);
  if (!entry) return;
  editingDocument = { type: kind, number };
  setView(kind === "invoice" ? "sale" : "estimate");
  clearItemRows(kind);
  $(`#${kind}Party`).value = entry.partyId;
  $(`#${kind}Date`).value = entry.date || today();
  $(`#${kind}PoNumber`).value = entry.poNumber || "";
  $(`#${kind}CampaignFromDate`).value = entry.campaignFromDate || entry.campaignDate || "";
  $(`#${kind}CampaignToDate`).value = entry.campaignToDate || entry.campaignDate || "";
  $(`#${kind}TaxType`).value = entry.taxType || "auto";
  $(`#${kind}Terms`).value = entry.terms || "";
  $(`#${kind}Description`).value = entry.description || "";
  const items = entry.items?.length ? entry.items : [entry];
  setPrimaryItem(kind, items[0]);
  items.slice(1).forEach((item) => addItemRow(kind, item));
  $(`#${kind}Form .transaction-head p`).textContent = `${entry.number} editing`;
  $(`#${kind}Form .primary[type="submit"]`).textContent = kind === "invoice" ? "Update Invoice" : "Update Estimate";
  updateSaleCalculation(kind);
}

function renderCompany() {
  const company = activeCompany();
  $("#currentCompany").innerHTML = `<span class="company-logo">${logoMarkup(company, "sidebar-logo-image")}</span><div><strong>${company.name}</strong><small>${company.gstin || "Business account"}</small></div>`;
  document.title = `${company.name} Billing`;
  $("#companyList").innerHTML = state.companies.map((company) => `<article class="company-row ${company.id === state.activeCompanyId ? "selected" : ""}"><span>${logoMarkup(company, "company-list-logo")}</span><div class="company-copy"><strong>${company.name}</strong><small>${company.gstin || "No GSTIN"}</small></div><div class="row-actions"><button type="button" data-company-id="${company.id}">Use</button><button type="button" data-company-edit="${company.id}">Edit</button></div></article>`).join("");
}

function renderParties() {
  const parties = scoped(state.parties);
  $("#partyCount").textContent = `${parties.length} records`;
  $("#partyList").innerHTML = parties.map((party) => `<article class="record"><div><strong>${party.name}</strong><small>${party.phone || "No phone"}${party.gstin ? ` | ${party.gstin}` : ""}</small><small>${addressText(party.address)}</small></div><div class="record-actions"><button class="text-button" type="button" data-party-edit="${party.id}">Edit</button><button class="delete-button" type="button" data-party-delete="${party.id}">Delete</button></div></article>`).join("") || "<p class=\"muted\">No party details yet.</p>";
  const options = parties.map((party) => `<option value="${party.id}">${party.name}</option>`).join("");
  $("#invoiceParty").innerHTML = options || "<option value=\"\">Add a party first</option>";
  $("#quoteParty").innerHTML = options || "<option value=\"\">Add a party first</option>";
}

function rows(entries, type) { return entries.slice().reverse().map((entry) => `<tr class="status-${statusSlug(entryStatus(entry, type))}"><td>${entry.number}</td><td>${entry.date}</td><td>${partyName(entry.partyId)}</td><td>${entry.item}</td><td>${statusSelect(type, entry)}</td><td class="right">${money(lineAmount(entry))}</td><td><button class="print-link" data-document-type="${type}" data-document-id="${entry.number}">View</button><button class="text-button" data-document-edit="${type}" data-document-id="${entry.number}">Edit</button><button class="delete-button" data-document-delete="${type}" data-document-id="${entry.number}">Delete</button></td></tr>`).join("") || "<tr><td colspan=\"7\" class=\"muted\">No records yet.</td></tr>"; }
function renderSales() { const invoices = scoped(state.invoices); const quotes = scoped(state.quotes); $("#invoiceCount").textContent = `${invoices.length} invoices`; $("#quoteCount").textContent = `${quotes.length} estimates`; $("#invoiceList").innerHTML = rows(invoices, "invoice"); $("#quoteList").innerHTML = rows(quotes, "quote"); }
function renderHome() { const invoices = scoped(state.invoices); const transactions = scoped(state.transactions); $("#partyMetric").textContent = scoped(state.parties).length; $("#invoiceMetric").textContent = invoices.length; $("#salesMetric").textContent = money(invoices.reduce((sum, entry) => sum + lineAmount(entry), 0)); $("#quoteMetric").textContent = scoped(state.quotes).length; $("#homeTransactions").innerHTML = transactions.slice().reverse().slice(0, 5).map((entry) => `<div class="record"><div><strong>${entry.type}</strong><small>${entry.reference} | ${partyName(entry.partyId)}</small></div><strong>${money(entry.amount)}</strong></div>`).join("") || "<p class=\"muted\">No transactions yet.</p>"; }
function renderTransactions() { $("#transactionList").innerHTML = scoped(state.transactions).slice().reverse().map((entry) => `<tr><td>${entry.date}</td><td>${entry.type}</td><td>${entry.reference}</td><td>${partyName(entry.partyId)}</td><td class="right">${money(entry.amount)}</td></tr>`).join("") || "<tr><td colspan=\"5\" class=\"muted\">No transactions yet.</td></tr>"; }
function cleanPhone(value) { return String(value || "").replace(/\D/g, ""); }
function renderSettings() { $("#invoicePrefix").value = state.settings.invoicePrefix; $("#quotePrefix").value = state.settings.quotePrefix; $("#currency").value = state.settings.currency; $("#recoveryPhone").value = members.admin.recoveryPhone || ""; $("#settingsPassword").value = ""; $("#settingsPasswordConfirm").value = ""; }
function renderAll() { renderCompany(); renderParties(); renderSales(); renderHome(); renderTransactions(); renderSettings(); updateSaleCalculation("invoice"); updateSaleCalculation("quote"); }

function updateSaleCalculation(kind) {
  const key = kind === "invoice" ? "invoice" : "quote";
  const items = draftItems(key);
  const area = items.reduce((sum, entry) => sum + (entry.unit === "Sq. Feet" ? sizeArea(entry.size) * Number(entry.qty || 1) : 0), 0);
  const amount = items.reduce((sum, entry) => sum + lineAmount(entry), 0);
  $(`#${key}Area`).textContent = `Area: ${area.toLocaleString("en-IN")} Sq. Ft`;
  $(`#${key}Amount`).textContent = `Amount: ${money(amount)}`;
  $(`#${key}Total`).textContent = money(amount);
}

function draftItems(kind) {
  const primary = { item: $(`#${kind}Item`).value, hsn: $(`#${kind}Hsn`).value, size: $(`#${kind}Size`).value, qty: Number($(`#${kind}Qty`).value || 1), unit: $(`#${kind}Unit`).value, rate: Number($(`#${kind}Rate`).value || 0), tax: Number($(`#${kind}Tax`).value || 0) };
  const extras = [...document.querySelectorAll(`.extra-entry-row[data-kind="${kind}"]`)].map((row) => ({ item: row.querySelector('[data-field="item"]').value, hsn: row.querySelector('[data-field="hsn"]').value, size: row.querySelector('[data-field="size"]').value, qty: Number(row.querySelector('[data-field="qty"]').value || 1), unit: row.querySelector('[data-field="unit"]').value, rate: Number(row.querySelector('[data-field="rate"]').value || 0), tax: Number(row.querySelector('[data-field="tax"]').value || 0) }));
  return [primary, ...extras];
}

function amountWords(amount) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]; const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const under100 = (n) => n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`; const under1000 = (n) => n < 100 ? under100(n) : `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${under100(n % 100)}` : ""}`;
  if (!amount) return "Zero Rupees Only"; const value = Math.round(amount); const lakh = Math.floor(value / 100000); const thousand = Math.floor((value % 100000) / 1000); const rest = value % 1000; return `${lakh ? `${under1000(lakh)} Lakh ` : ""}${thousand ? `${under1000(thousand)} Thousand ` : ""}${rest ? under1000(rest) : ""} Rupees Only`.trim();
}

function showDocument(type, number) {
  const entry = scoped(type === "invoice" ? state.invoices : state.quotes).find((record) => record.number === number); if (!entry) return;
  openedDocument = { type, number };
  const company = activeCompany(); const party = partyById(entry.partyId) || {}; const tax = taxAmounts(entry); const title = type === "invoice" ? "TAX INVOICE" : "ESTIMATE"; const heading = type === "invoice" ? "Invoice No." : "Estimate No."; const rateLabel = entry.unit === "Sq. Feet" ? "Rate / Sq. Ft" : "Price / Unit";
  const taxColumn = tax.type === "igst" ? `<td>${money(tax.igst)}<small>IGST ${entry.tax || 0}%</small></td>` : `<td>${money(tax.cgst)}<small>CGST ${Number(entry.tax || 0) / 2}%</small></td><td>${money(tax.sgst)}<small>SGST ${Number(entry.tax || 0) / 2}%</small></td>`;
  const taxSummary = tax.type === "igst" ? `<tr><td>IGST</td><td>${money(tax.base)}</td><td>${entry.tax || 0}%</td><td>${money(tax.igst)}</td></tr>` : `<tr><td>CGST</td><td>${money(tax.base)}</td><td>${Number(entry.tax || 0) / 2}%</td><td>${money(tax.cgst)}</td></tr><tr><td>SGST</td><td>${money(tax.base)}</td><td>${Number(entry.tax || 0) / 2}%</td><td>${money(tax.sgst)}</td></tr>`;
  $("#printDocumentContent").innerHTML = `<h2 class="reference-doc-title">${type === "invoice" ? "Sale" : "Estimate / Quotation"}</h2><div class="reference-company"><div class="logo-box">${company.name.slice(0, 2).toUpperCase()}</div><div><h1>${company.name}</h1><p>${addressText(company.address)}</p><p>Ph. no.: ${company.phone || "-"}</p></div></div><div class="reference-meta"><section><h3>Bill To:</h3><b>${party.name || "-"}</b><p>${addressText(party.address)}</p><p>Contact No.: ${party.phone || "-"}</p></section><section><h3>Shipping To</h3><p>${addressText(party.address)}</p></section><section><h3>${type === "invoice" ? "Invoice Details" : "Estimate Details"}</h3><p>${heading} ${entry.number}</p><p>Date: ${entry.date}</p><p>State: ${party.address?.state || "-"}</p></section></div><table class="reference-items"><thead><tr><th>#</th><th>Item name</th><th>HSC/SAC</th><th>Quantity</th><th>${rateLabel}</th><th>Discount</th>${tax.type === "igst" ? "<th>IGST</th>" : "<th>CGST</th><th>SGST</th>"}<th>Amount</th></tr></thead><tbody><tr><td>1</td><td><b>${entry.item}</b><small>${entry.size || ""} ${entry.unit}</small></td><td>${entry.hsn || "-"}</td><td>${billQuantity(entry).toLocaleString("en-IN")}</td><td>${money(entry.rate)}</td><td>${money(0)}</td>${taxColumn}<td>${money(tax.total)}</td></tr></tbody><tfoot><tr><td></td><td><b>Total</b></td><td></td><td><b>${billQuantity(entry).toLocaleString("en-IN")}</b></td><td></td><td></td>${tax.type === "igst" ? `<td><b>${money(tax.igst)}</b></td>` : `<td><b>${money(tax.cgst)}</b></td><td><b>${money(tax.sgst)}</b></td>`}<td><b>${money(tax.total)}</b></td></tr></tfoot></table><div class="reference-lower"><table><thead><tr><th>Tax type</th><th>Taxable amount</th><th>Rate</th><th>Tax amount</th></tr></thead><tbody>${taxSummary}</tbody></table><table><thead><tr><th colspan="2">Amounts</th></tr></thead><tbody><tr><td>Sub Total</td><td>${money(tax.base)}</td></tr><tr><td>Total</td><td><b>${money(tax.total)}</b></td></tr><tr><td>Balance</td><td>${money(tax.total)}</td></tr></tbody></table></div><div class="reference-words"><section><h3>Invoice Amount In Words</h3><p>${amountWords(tax.total)}</p></section><section><h3>Description</h3><p>Sale Description</p></section></div><div class="reference-footer"><section><h3>Bank Details</h3><p>Bank Name: ${company.bank.name || "-"}</p><p>Account No.: ${company.bank.accountNumber || "-"}</p><p>IFSC Code: ${company.bank.ifscCode || "-"}</p></section><section><h3>Terms and conditions</h3><p>${company.terms || "-"}</p></section><section><p>For: ${company.name}</p><div class="signature-box">${company.name.slice(0, 2).toUpperCase()}</div><b>Authorized Signatory</b></section></div>`;
  const documentTitle = $("#printDocumentContent .reference-doc-title");
  if (documentTitle && type === "invoice") documentTitle.textContent = "Sale Invoice";
  const signatureBox = $("#printDocumentContent .signature-box");
  if (signatureBox) signatureBox.innerHTML = company.signature ? `<img class="document-signature" src="${company.signature}" alt="${company.name} signature">` : "";
  const documentItems = entry.items?.length ? entry.items : [entry];
  const documentTable = $("#printDocumentContent .reference-items");
  const documentRows = documentItems.map((item, index) => { const base = lineAmount(item); const itemTax = base * Number(item.tax || 0) / 100; const taxCells = tax.type === "igst" ? `<td>${money(itemTax)}<small>IGST ${item.tax || 0}%</small></td>` : `<td>${money(itemTax / 2)}<small>CGST ${Number(item.tax || 0) / 2}%</small></td><td>${money(itemTax / 2)}<small>SGST ${Number(item.tax || 0) / 2}%</small></td>`; return `<tr><td>${index + 1}</td><td><b>${item.item}</b><small>${item.size || ""} ${item.unit}</small></td><td>${item.hsn || "-"}</td><td>${billQuantity(item).toLocaleString("en-IN")}</td><td>${money(item.rate)}</td><td>${money(0)}</td>${taxCells}<td>${money(base + itemTax)}</td></tr>`; }).join("");
  const totalQuantity = documentItems.reduce((sum, item) => sum + billQuantity(item), 0);
  if (documentTable) { documentTable.tBodies[0].innerHTML = documentRows; documentTable.tFoot.innerHTML = `<tr><td></td><td><b>Total</b></td><td></td><td><b>${totalQuantity.toLocaleString("en-IN")}</b></td><td></td><td></td>${tax.type === "igst" ? `<td><b>${money(tax.igst)}</b></td>` : `<td><b>${money(tax.cgst)}</b></td><td><b>${money(tax.sgst)}</b></td>`}<td><b>${money(tax.total)}</b></td></tr>`; }
  const details = $("#printDocumentContent .reference-meta section:last-child");
  if (details) details.insertAdjacentHTML("beforeend", `<p>Status: ${entryStatus(entry, type)}</p>${entry.poNumber ? `<p>PO No.: ${entry.poNumber}</p>` : ""}${entry.campaignFromDate || entry.campaignDate ? `<p>Campaign From: ${entry.campaignFromDate || entry.campaignDate}</p>` : ""}${entry.campaignToDate || entry.campaignDate ? `<p>Campaign To: ${entry.campaignToDate || entry.campaignDate}</p>` : ""}`);
  const bankDetails = $("#printDocumentContent .reference-footer section:first-child");
  if (bankDetails && company.bank.accountHolder) bankDetails.insertAdjacentHTML("beforeend", `<p>Account Holder: ${company.bank.accountHolder}</p>`);
  const documentTerms = $("#printDocumentContent .reference-footer section:nth-child(2) p");
  const documentDescription = $("#printDocumentContent .reference-words section:last-child p");
  if (documentTerms) { documentTerms.textContent = entry.terms || "-"; documentTerms.classList.add("pre-line"); }
  if (documentDescription) { documentDescription.textContent = entry.description || "-"; documentDescription.classList.add("pre-line"); }
  if (company.logo) {
    const sheet = $("#printDocumentContent");
    sheet.insertAdjacentHTML("afterbegin", `<img class="document-watermark" src="${company.logo}" alt="">`);
    sheet.querySelectorAll(".logo-box").forEach((box) => { box.innerHTML = `<img class="document-logo" src="${company.logo}" alt="${company.name} logo">`; });
  }
  $("#documentOverlay").classList.add("show"); $("#documentOverlay").setAttribute("aria-hidden", "false");
}

$$('[data-view]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#partyNav").addEventListener("click", () => {
  const menu = $("#partyChildren");
  const open = !menu.classList.contains("open");
  menu.classList.toggle("open", open);
  $("#partyNav").classList.toggle("active", open);
});
$("#saleNav").addEventListener("click", () => {
  const menu = $("#saleChildren");
  const open = !menu.classList.contains("open");
  menu.classList.toggle("open", open);
  $("#saleNav").classList.toggle("active", open);
});
$("#settingsNav").addEventListener("click", () => {
  const menu = $("#settingsChildren");
  const open = !menu.classList.contains("open");
  menu.classList.toggle("open", open);
  $("#settingsNav").classList.toggle("active", open);
});
$("#companyButton").addEventListener("click", () => $("#companyMenu").classList.toggle("show"));
$("#companyLogoFile").addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; pendingCompanyLogo = await readFileAsDataUrl(file); showCompanyLogoPreview(pendingCompanyLogo); });
$("#companySignatureFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    pendingCompanySignature = await cleanSignatureImage(await readFileAsDataUrl(file));
    showCompanySignaturePreview(pendingCompanySignature);
    toast("Signature background cleared.");
  } catch (error) {
    console.error(error);
    pendingCompanySignature = await readFileAsDataUrl(file);
    showCompanySignaturePreview(pendingCompanySignature);
    toast("Signature added.");
  }
});
$("#clearCompanyLogo").addEventListener("click", () => { pendingCompanyLogo = ""; $("#companyLogoFile").value = ""; showCompanyLogoPreview(""); });
$("#clearCompanySignature").addEventListener("click", () => { pendingCompanySignature = ""; $("#companySignatureFile").value = ""; showCompanySignaturePreview(""); });
$("#sidebarToggle").addEventListener("click", () => setSidebarCollapsed(!$(".app-shell").classList.contains("sidebar-collapsed")));
$("#addCompanyMenu").addEventListener("click", () => { setView("companies"); resetCompanyForm(); $("#companyForm").classList.remove("hidden"); });
$("#addCompany").addEventListener("click", () => { resetCompanyForm(); $("#companyForm").classList.remove("hidden"); });
$("#backFromCompany").addEventListener("click", () => setView("home"));
$("#showPartyForm").addEventListener("click", () => { resetPartyForm(); $("#partyForm").classList.remove("hidden"); });
$("#quickInvoice").addEventListener("click", () => { setView("sale"); resetSaleForm("invoice"); });

$("#companyList").addEventListener("click", (event) => { const use = event.target.closest("[data-company-id]"); const edit = event.target.closest("[data-company-edit]"); if (use) { state.activeCompanyId = use.dataset.companyId; editingDocument = null; openedDocument = null; resetSaleForm("invoice"); resetSaleForm("quote"); save(); renderAll(); toast("Company changed."); } if (edit) { const company = state.companies.find((item) => item.id === edit.dataset.companyEdit); if (!company) return; editingCompanyId = company.id; pendingCompanyLogo = company.logo || ""; pendingCompanySignature = company.signature || ""; showCompanyLogoPreview(pendingCompanyLogo); showCompanySignaturePreview(pendingCompanySignature); $("#companyFormTitle").textContent = "Edit Company"; $("#companyName").value = company.name; $("#companyGstin").value = company.gstin; $("#companyPhone").value = company.phone; $("#companyAddressLine1").value = company.address.line1 || ""; $("#companyAddressLine2").value = company.address.line2 || ""; $("#companyCity").value = company.address.city || ""; $("#companyState").value = company.address.state || "Tamil Nadu"; $("#companyPincode").value = company.address.pincode || ""; $("#companyBankName").value = company.bank.name || ""; $("#companyAccountHolder").value = company.bank.accountHolder || ""; $("#companyAccountNumber").value = company.bank.accountNumber || ""; $("#companyIfscCode").value = company.bank.ifscCode || ""; $("#companyForm").classList.remove("hidden"); } });
$("#partyList").addEventListener("click", (event) => { const remove = event.target.closest("[data-party-delete]"); if (remove) { const partyId = remove.dataset.partyDelete; const hasDocuments = [...scoped(state.invoices), ...scoped(state.quotes)].some((entry) => entry.partyId === partyId); if (hasDocuments) return toast("Delete this party's invoices and estimates first."); if (!window.confirm("Delete this party?")) return; state.parties = state.parties.filter((party) => party.id !== partyId); save(); renderAll(); return toast("Party deleted."); } const button = event.target.closest("[data-party-edit]"); if (!button) return; const party = partyById(button.dataset.partyEdit); if (!party) return; editingPartyId = party.id; $("#partyForm h2").textContent = "Edit Party"; $("#partyName").value = party.name; $("#partyPhone").value = party.phone; $("#partyGstin").value = party.gstin; $("#partyGstType").value = party.gstType || "Unregistered / Consumer"; $("#partyEmail").value = party.email || ""; $("#partyAddressLine1").value = party.address.line1 || ""; $("#partyAddressLine2").value = party.address.line2 || ""; $("#partyCity").value = party.address.city || ""; $("#partyState").value = party.address.state || "Tamil Nadu"; $("#partyPincode").value = party.address.pincode || ""; $("#partyForm").classList.remove("hidden"); });

$("#companyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const wasEditing = Boolean(editingCompanyId);
  const existingCompany = state.companies.find((item) => item.id === editingCompanyId);
  if (pendingCompanySignature?.startsWith("data:image/")) {
    try { pendingCompanySignature = await cleanSignatureImage(pendingCompanySignature); } catch (error) { console.warn(error); }
  }
  const company = { id: editingCompanyId || uid(), name: $("#companyName").value.trim(), logo: pendingCompanyLogo, signature: pendingCompanySignature, gstin: $("#companyGstin").value.trim(), phone: $("#companyPhone").value.trim(), address: addressFrom("company"), bank: { name: $("#companyBankName").value.trim(), accountHolder: $("#companyAccountHolder").value.trim(), accountNumber: $("#companyAccountNumber").value.trim(), ifscCode: $("#companyIfscCode").value.trim() }, terms: existingCompany?.terms || defaults.companies[0].terms };
  if (wasEditing) Object.assign(existingCompany, company);
  else {
    state.companies.push(company);
    state.activeCompanyId = company.id;
  }
  resetCompanyForm();
  $("#companyForm").classList.add("hidden");
  save();
  renderAll();
  toast(wasEditing ? "Company updated." : "Company added.");
});
function saveParty(keepOpen) { const party = { id: editingPartyId || uid(), companyId: state.activeCompanyId, name: $("#partyName").value.trim(), phone: $("#partyPhone").value.trim(), gstin: $("#partyGstin").value.trim(), gstType: $("#partyGstType").value, email: $("#partyEmail").value.trim(), address: addressFrom("party") }; const wasEditing = Boolean(editingPartyId); if (wasEditing) Object.assign(partyById(editingPartyId), party); else state.parties.push(party); resetPartyForm(); if (!keepOpen) $("#partyForm").classList.add("hidden"); save(); renderAll(); toast(wasEditing ? "Party updated." : "Party details saved."); }
$("#partyForm").addEventListener("submit", (event) => { event.preventDefault(); saveParty(false); });
$("#savePartyNew").addEventListener("click", () => { if (!$("#partyForm").reportValidity()) return; saveParty(true); $("#partyName").focus(); });
$("#closePartyForm").addEventListener("click", () => { resetPartyForm(); $("#partyForm").classList.add("hidden"); });

function saveSale(kind) {
  return (event) => {
    event.preventDefault();
    const isInvoice = kind === "invoice";
    const listKey = isInvoice ? "invoices" : "quotes";
    const list = isInvoice ? scoped(state.invoices) : scoped(state.quotes);
    const items = draftItems(kind).filter((item) => item.item.trim());
    if (!items.length) return toast("Add at least one item.");
    const existing = editingDocument?.type === kind ? state[listKey].find((entry) => entry.companyId === state.activeCompanyId && entry.number === editingDocument.number) : null;
    const first = items[0];
    const entry = {
      ...(existing || {}),
      number: existing?.number || ref(isInvoice ? state.settings.invoicePrefix : state.settings.quotePrefix, list),
      companyId: state.activeCompanyId,
      date: $(`#${kind}Date`).value || today(),
      poNumber: $(`#${kind}PoNumber`).value.trim(),
      campaignFromDate: $(`#${kind}CampaignFromDate`).value,
      campaignToDate: $(`#${kind}CampaignToDate`).value,
      partyId: $(`#${kind}Party`).value,
      ...first,
      items,
      status: existing?.status || defaultStatus(kind),
      taxType: $(`#${kind}TaxType`).value,
      terms: $(`#${kind}Terms`).value.trim(),
      description: $(`#${kind}Description`).value.trim()
    };
    if (!entry.partyId) return toast("Add a party first.");
    if (existing) Object.assign(existing, entry);
    else state[listKey].push(entry);
    const transactionType = isInvoice ? "Sale Invoice" : "Estimate / Quotation";
    const transaction = state.transactions.find((item) => item.companyId === state.activeCompanyId && item.reference === entry.number);
    const transactionData = { companyId: state.activeCompanyId, date: entry.date, type: transactionType, reference: entry.number, partyId: entry.partyId, amount: lineAmount(entry) };
    if (transaction) Object.assign(transaction, transactionData);
    else state.transactions.push(transactionData);
    editingDocument = null;
    resetSaleForm(kind);
    save();
    renderAll();
    showDocument(isInvoice ? "invoice" : "quote", entry.number);
    toast(existing ? (isInvoice ? "Invoice updated." : "Estimate updated.") : (isInvoice ? "Sale invoice saved." : "Estimate saved."));
  };
}
$("#invoiceForm").addEventListener("submit", saveSale("invoice")); $("#quoteForm").addEventListener("submit", saveSale("quote"));
$("#invoiceForm .entry-total button").addEventListener("click", () => addItemRow("invoice"));
$("#quoteForm .entry-total button").addEventListener("click", () => addItemRow("quote"));
$("#settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const password = $("#settingsPassword").value;
  const confirmPassword = $("#settingsPasswordConfirm").value;
  if (password || confirmPassword) {
    if (password.length < 6) return toast("Password needs at least 6 characters.");
    if (password !== confirmPassword) return toast("Passwords do not match.");
    members.admin.password = password;
  }
  members.admin.recoveryPhone = cleanPhone($("#recoveryPhone").value);
  saveMembers();
  state.settings = { ...state.settings, invoicePrefix: $("#invoicePrefix").value.trim() || "INV", quotePrefix: $("#quotePrefix").value.trim() || "EST", currency: $("#currency").value.trim() || "Rs." };
  save();
  renderAll();
  toast(password ? "Settings and login password saved." : "General settings saved.");
});
$("#exportBackup").addEventListener("click", exportBackup);
$("#importBackup").addEventListener("change", (event) => { const file = event.target.files[0]; if (file) importBackupFile(file); event.target.value = ""; });
["invoice", "quote"].forEach((kind) => ["Size", "Qty", "Rate", "Unit"].forEach((field) => { $(`#${kind}${field}`).addEventListener("input", () => updateSaleCalculation(kind)); $(`#${kind}${field}`).addEventListener("change", () => updateSaleCalculation(kind)); }));
$("#search").addEventListener("input", () => { const query = $("#search").value.toLowerCase(); $$(".record, tbody tr").forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(query); }); });
function deleteDocument(type, number) { if (!window.confirm(`Delete ${type === "invoice" ? "this invoice" : "this estimate"}?`)) return; const listKey = type === "invoice" ? "invoices" : "quotes"; state[listKey] = state[listKey].filter((entry) => !(entry.companyId === state.activeCompanyId && entry.number === number)); state.transactions = state.transactions.filter((entry) => !(entry.companyId === state.activeCompanyId && entry.reference === number)); save(); renderAll(); toast(type === "invoice" ? "Invoice deleted." : "Estimate deleted."); }
function handleDocumentAction(event) {
  const status = event.target.closest("[data-status-type]");
  if (status) {
    const listKey = status.dataset.statusType === "invoice" ? "invoices" : "quotes";
    const entry = state[listKey].find((record) => record.companyId === state.activeCompanyId && record.number === status.dataset.statusId);
    if (entry) { entry.status = status.value; save(); renderAll(); toast("Status updated."); }
    return;
  }
  const edit = event.target.closest("[data-document-edit]");
  if (edit) return startEditDocument(edit.dataset.documentEdit, edit.dataset.documentId);
  const remove = event.target.closest("[data-document-delete]");
  if (remove) return deleteDocument(remove.dataset.documentDelete, remove.dataset.documentId);
  const button = event.target.closest("[data-document-id]");
  if (button) showDocument(button.dataset.documentType, button.dataset.documentId);
}
$("#invoiceList").addEventListener("click", handleDocumentAction); $("#quoteList").addEventListener("click", handleDocumentAction); $("#invoiceList").addEventListener("change", handleDocumentAction); $("#quoteList").addEventListener("change", handleDocumentAction); $("#closeDocument").addEventListener("click", () => { $("#documentOverlay").classList.remove("show"); $("#documentOverlay").setAttribute("aria-hidden", "true"); }); $("#editDocument").addEventListener("click", () => { if (!openedDocument) return toast("Open an invoice or estimate first."); $("#documentOverlay").classList.remove("show"); $("#documentOverlay").setAttribute("aria-hidden", "true"); startEditDocument(openedDocument.type, openedDocument.number); }); $("#printDocument").addEventListener("click", () => window.print());

function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function backupFilename() { return `tbd-billing-backup-${new Date().toISOString().slice(0, 10)}.json`; }
function exportBackup() {
  const backup = { version: 1, exportedAt: new Date().toISOString(), state, members };
  downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), backupFilename());
  toast("All data exported.");
}
function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      if (!backup?.state?.companies) return toast("Invalid backup file.");
      state = { ...structuredClone(defaults), ...backup.state, settings: { ...defaults.settings, ...backup.state.settings } };
      save();
      if (backup.members?.admin) {
        Object.assign(members, backup.members);
        saveMembers();
      }
      renderAll();
      renderSession();
      toast("Backup imported.");
    } catch {
      toast("Could not import backup.");
    }
  };
  reader.readAsText(file);
}
function documentFilename(extension) { const title = $("#printDocumentContent .reference-doc-title")?.textContent || "billing-document"; const company = activeCompany().name || "company"; return `${company}-${title}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() + `.${extension}`; }
function pdfEscape(value) { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, " "); }
function downloadPdf() { window.print(); }
function downloadWord(download = true) {
  const source = $("#printDocumentContent");
  const meta = [...source.querySelectorAll(".reference-meta section")].map((section) => section.innerHTML);
  const lower = [...source.querySelectorAll(".reference-lower table")].map((table) => table.outerHTML);
  const words = [...source.querySelectorAll(".reference-words section")].map((section) => section.innerHTML);
  const footer = [...source.querySelectorAll(".reference-footer section")].map((section) => section.innerHTML);
  const company = source.querySelector(".reference-company");
  const companyParts = company ? [...company.children] : [];
  const logo = companyParts[0]?.innerHTML || "";
  const companyInfo = companyParts[1]?.innerHTML || "";
  const title = source.querySelector(".reference-doc-title")?.outerHTML || "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:A4;margin:8mm}body{font-family:Arial,sans-serif;color:#30333d;font-size:10pt}.word-sheet{width:100%}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #777;padding:6px;vertical-align:top}.company td{border:1px solid #777}.company td:last-child{text-align:right}.logo-box{width:70px;height:70px;background:#fff;text-align:center;vertical-align:middle}.signature-box{width:136px;height:78px;margin:8px auto 4px;background:transparent;border:0;text-align:center;vertical-align:top;overflow:hidden}.document-logo{width:70px;height:70px;object-fit:contain}.document-signature{width:128px;max-height:70px;object-fit:contain;filter:contrast(1.18) saturate(1.18)}.reference-doc-title{text-align:center;font-size:17pt;margin:0 0 10px}.reference-meta h3,.reference-words h3,.reference-footer h3{margin:-6px -6px 7px;padding:6px;background:#928add;color:#fff;font-size:10pt}.reference-items th,.reference-lower th{background:#928add;color:#fff;font-size:9pt}.reference-items td,.reference-items th,.reference-lower td,.reference-lower th{border:1px solid #777;padding:6px;text-align:right}.reference-items td:nth-child(2),.reference-items th:nth-child(2),.reference-lower td:first-child,.reference-lower th:first-child{text-align:left}.reference-items small{display:block;margin-top:4px}.word-grid td{width:33.33%}.word-two td{width:50%}.word-footer td{width:33.33%}.word-footer td:last-child{text-align:center}.word-footer p,.reference-meta p{margin:4px 0;white-space:pre-line}.reference-lower{width:100%}.reference-lower td{border:0;padding:0}.reference-lower table{width:100%}
  </style></head><body><div class="word-sheet">${title}<table class="company"><tr><td style="width:18%">${logo}</td><td>${companyInfo}</td></tr></table><table class="word-grid"><tr>${meta.map((value) => `<td>${value}</td>`).join("")}</tr></table>${source.querySelector(".reference-items")?.outerHTML || ""}<table class="reference-lower"><tr>${lower.map((value) => `<td>${value}</td>`).join("")}</tr></table><table class="word-two"><tr>${words.map((value) => `<td>${value}</td>`).join("")}</tr></table><table class="word-footer"><tr>${footer.map((value) => `<td>${value}</td>`).join("")}</tr></table></div></body></html>`;
  const blob = new Blob([html], { type: "application/msword" });
  if (download) downloadBlob(blob, documentFilename("doc"));
  return blob;
}
$("#downloadDocument").addEventListener("click", () => { if (!$("#printDocumentContent").innerHTML.trim()) return toast("Open an invoice or estimate first."); if ($("#downloadFormat").value === "word") downloadWord(); else { toast("In the print window, choose Save as PDF."); downloadPdf(); } });
$("#loginForm").addEventListener("submit", (event) => { event.preventDefault(); const key = "admin"; if ($("#loginPassword").value !== members[key].password) { loginError("Wrong password. Please try again."); $("#loginPassword").focus(); return; } loginError(""); sessionStorage.setItem("tbd-active-member", key); localStorage.removeItem("tbd-active-member"); $("#loginPassword").value = ""; renderSession(); toast(`Welcome, ${members[key].name}.`); });
$("#forgotPasswordButton").addEventListener("click", () => {
  loginError("");
  if (!members.admin.recoveryPhone) return loginError("Recovery phone is not set. Login and save it in Settings first.", "info");
  const phone = cleanPhone(window.prompt("Enter recovery phone number") || "");
  if (!phone) return;
  if (phone !== cleanPhone(members.admin.recoveryPhone)) return loginError("Recovery number does not match.");
  const password = window.prompt("Enter new password, minimum 6 characters") || "";
  if (password.length < 6) return loginError("Password needs at least 6 characters.");
  const confirmPassword = window.prompt("Confirm new password") || "";
  if (password !== confirmPassword) return loginError("Passwords do not match.");
  members.admin.password = password;
  saveMembers();
  loginError("Password updated. Login with new password.", "success");
});
$("#logoutButton").addEventListener("click", () => { sessionStorage.removeItem("tbd-active-member"); localStorage.removeItem("tbd-active-member"); renderSession(); });

renderAll();
renderSession();
setSidebarCollapsed(localStorage.getItem("tbd-sidebar-collapsed") === "true");
initCloudSync();
