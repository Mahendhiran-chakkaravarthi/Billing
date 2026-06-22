const storageKey = "tbd-simple-billing";

const defaults = {
  activeCompanyId: "company-1",
  companies: [{ id: "company-1", name: "TBD Books", gstin: "", phone: "", address: { line1: "", line2: "", city: "", state: "Tamil Nadu", pincode: "" }, bank: { name: "", accountNumber: "", ifscCode: "" }, terms: "Thanks for doing business with us." }],
  parties: [], invoices: [], quotes: [], transactions: [],
  settings: { invoicePrefix: "INV", quotePrefix: "EST", currency: "Rs.", bankName: "", accountNumber: "", ifscCode: "" }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let editingCompanyId = null;
let editingPartyId = null;
let state = load();

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
    result.companies = (result.companies || defaults.companies).map((company) => ({ ...company, address: typeof company.address === "object" ? company.address : { ...defaults.companies[0].address, line1: company.address || "" }, bank: { ...defaults.companies[0].bank, ...company.bank }, terms: company.terms || defaults.companies[0].terms }));
    return result;
  } catch { return structuredClone(defaults); }
}

function save() { localStorage.setItem(storageKey, JSON.stringify(state)); }
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
function lineAmount(entry) { return billQuantity(entry) * Number(entry.rate || 0); }
function resolvedTaxType(entry) { if (entry.taxType && entry.taxType !== "auto") return entry.taxType; const party = partyById(entry.partyId); return party?.address?.state && activeCompany().address?.state && party.address.state.trim().toLowerCase() !== activeCompany().address.state.trim().toLowerCase() ? "igst" : "cgst-sgst"; }
function taxAmounts(entry) { const base = lineAmount(entry); const totalTax = base * Number(entry.tax || 0) / 100; const type = resolvedTaxType(entry); return { base, type, cgst: type === "cgst-sgst" ? totalTax / 2 : 0, sgst: type === "cgst-sgst" ? totalTax / 2 : 0, igst: type === "igst" ? totalTax : 0, total: base + totalTax }; }

function toast(message) { $("#toast").textContent = message; $("#toast").classList.add("show"); setTimeout(() => $("#toast").classList.remove("show"), 1800); }
function setView(view) { $$(".view").forEach((node) => node.classList.toggle("active", node.id === `${view}View`)); $$(".nav-item, .nav-child").forEach((node) => node.classList.toggle("active", node.dataset.view === view)); $("#companyMenu").classList.remove("show"); }
function resetCompanyForm() { editingCompanyId = null; $("#companyFormTitle").textContent = "Add Company"; $("#companyForm").reset(); $("#companyState").value = "Tamil Nadu"; $("#companyTerms").value = "Thanks for doing business with us."; }
function resetPartyForm() { editingPartyId = null; $("#partyForm h2").textContent = "Add Party Details"; $("#partyForm").reset(); $("#partyState").value = "Tamil Nadu"; }

function renderCompany() {
  const company = activeCompany();
  $("#currentCompany").innerHTML = `<span class="company-logo">${company.name.slice(0, 2).toUpperCase()}</span><div><strong>${company.name}</strong><small>${company.gstin || "Business account"}</small></div>`;
  document.title = `${company.name} Billing`;
  $("#companyList").innerHTML = state.companies.map((company) => `<article class="company-row ${company.id === state.activeCompanyId ? "selected" : ""}"><span>${company.name.slice(0, 2).toUpperCase()}</span><div class="company-copy"><strong>${company.name}</strong><small>${company.gstin || "No GSTIN"}</small></div><div class="row-actions"><button type="button" data-company-id="${company.id}">Use</button><button type="button" data-company-edit="${company.id}">Edit</button></div></article>`).join("");
}

function renderParties() {
  const parties = scoped(state.parties);
  $("#partyCount").textContent = `${parties.length} records`;
  $("#partyList").innerHTML = parties.map((party) => `<article class="record"><div><strong>${party.name}</strong><small>${party.phone || "No phone"}${party.gstin ? ` | ${party.gstin}` : ""}</small><small>${addressText(party.address)}</small></div><button class="text-button" type="button" data-party-edit="${party.id}">Edit</button></article>`).join("") || "<p class=\"muted\">No party details yet.</p>";
  const options = parties.map((party) => `<option value="${party.id}">${party.name}</option>`).join("");
  $("#invoiceParty").innerHTML = options || "<option value=\"\">Add a party first</option>";
  $("#quoteParty").innerHTML = options || "<option value=\"\">Add a party first</option>";
}

function rows(entries, type) { return entries.slice().reverse().map((entry) => `<tr><td>${entry.number}</td><td>${entry.date}</td><td>${partyName(entry.partyId)}</td><td>${entry.item}</td><td class="right">${money(lineAmount(entry))}</td><td><button class="print-link" data-document-type="${type}" data-document-id="${entry.number}">View</button></td></tr>`).join("") || "<tr><td colspan=\"6\" class=\"muted\">No records yet.</td></tr>"; }
function renderSales() { const invoices = scoped(state.invoices); const quotes = scoped(state.quotes); $("#invoiceCount").textContent = `${invoices.length} invoices`; $("#quoteCount").textContent = `${quotes.length} estimates`; $("#invoiceList").innerHTML = rows(invoices, "invoice"); $("#quoteList").innerHTML = rows(quotes, "quote"); }
function renderHome() { const invoices = scoped(state.invoices); const transactions = scoped(state.transactions); $("#partyMetric").textContent = scoped(state.parties).length; $("#invoiceMetric").textContent = invoices.length; $("#salesMetric").textContent = money(invoices.reduce((sum, entry) => sum + lineAmount(entry), 0)); $("#quoteMetric").textContent = scoped(state.quotes).length; $("#homeTransactions").innerHTML = transactions.slice().reverse().slice(0, 5).map((entry) => `<div class="record"><div><strong>${entry.type}</strong><small>${entry.reference} | ${partyName(entry.partyId)}</small></div><strong>${money(entry.amount)}</strong></div>`).join("") || "<p class=\"muted\">No transactions yet.</p>"; }
function renderTransactions() { $("#transactionList").innerHTML = scoped(state.transactions).slice().reverse().map((entry) => `<tr><td>${entry.date}</td><td>${entry.type}</td><td>${entry.reference}</td><td>${partyName(entry.partyId)}</td><td class="right">${money(entry.amount)}</td></tr>`).join("") || "<tr><td colspan=\"5\" class=\"muted\">No transactions yet.</td></tr>"; }
function renderSettings() { $("#invoicePrefix").value = state.settings.invoicePrefix; $("#quotePrefix").value = state.settings.quotePrefix; $("#currency").value = state.settings.currency; $("#bankName").value = state.settings.bankName || ""; $("#accountNumber").value = state.settings.accountNumber || ""; $("#ifscCode").value = state.settings.ifscCode || ""; }
function renderAll() { renderCompany(); renderParties(); renderSales(); renderHome(); renderTransactions(); renderSettings(); updateSaleCalculation("invoice"); updateSaleCalculation("quote"); }

function updateSaleCalculation(kind) {
  const key = kind === "invoice" ? "invoice" : "quote";
  const entry = { size: $(`#${key}Size`).value, unit: $(`#${key}Unit`).value, qty: $(`#${key}Qty`).value, rate: $(`#${key}Rate`).value };
  const area = sizeArea(entry.size) * Number(entry.qty || 1);
  const amount = lineAmount(entry);
  $(`#${key}Area`).textContent = `Area: ${area.toLocaleString("en-IN")} Sq. Ft`;
  $(`#${key}Amount`).textContent = `Amount: ${money(amount)}`;
}

function amountWords(amount) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]; const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const under100 = (n) => n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`; const under1000 = (n) => n < 100 ? under100(n) : `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${under100(n % 100)}` : ""}`;
  if (!amount) return "Zero Rupees Only"; const value = Math.round(amount); const lakh = Math.floor(value / 100000); const thousand = Math.floor((value % 100000) / 1000); const rest = value % 1000; return `${lakh ? `${under1000(lakh)} Lakh ` : ""}${thousand ? `${under1000(thousand)} Thousand ` : ""}${rest ? under1000(rest) : ""} Rupees Only`.trim();
}

function showDocument(type, number) {
  const entry = scoped(type === "invoice" ? state.invoices : state.quotes).find((record) => record.number === number); if (!entry) return;
  const company = activeCompany(); const party = partyById(entry.partyId) || {}; const tax = taxAmounts(entry); const title = type === "invoice" ? "TAX INVOICE" : "ESTIMATE"; const heading = type === "invoice" ? "Invoice No." : "Estimate No."; const rateLabel = entry.unit === "Sq. Feet" ? "Rate / Sq. Ft" : "Price / Unit";
  const taxRows = tax.type === "igst" ? `<p><span>IGST @ ${entry.tax || 0}%</span><b>${money(tax.igst)}</b></p>` : `<p><span>CGST @ ${Number(entry.tax || 0) / 2}%</span><b>${money(tax.cgst)}</b></p><p><span>SGST @ ${Number(entry.tax || 0) / 2}%</span><b>${money(tax.sgst)}</b></p>`;
  $("#printDocumentContent").innerHTML = `<div class="print-company"><div><h1>${company.name}</h1><p>${addressText(company.address)}</p><p>Phone: ${company.phone || "-"}</p><p>GSTIN: ${company.gstin || "-"}</p></div><div class="print-brand">${company.name.slice(0, 2).toUpperCase()}</div></div><h2 class="document-title">${title}</h2><div class="document-parties"><div><strong>Bill To</strong><h3>${party.name || "-"}</h3><p>${addressText(party.address)}</p><p>Phone: ${party.phone || "-"}</p><p>GSTIN: ${party.gstin || "-"}</p></div><div><strong>${type === "invoice" ? "Invoice Details" : "Estimate Details"}</strong><p>${heading} <b>${entry.number}</b></p><p>Date: ${entry.date}</p><p>Place of Supply: ${party.address?.state || "-"}</p></div></div><table class="print-table"><thead><tr><th>#</th><th>Item Name</th><th>HSN / SAC</th><th>Size</th><th>Unit</th><th>Quantity</th><th>${rateLabel}</th><th>Amount</th></tr></thead><tbody><tr><td>1</td><td>${entry.item}</td><td>${entry.hsn || "-"}</td><td>${entry.size || "-"}</td><td>${entry.unit}</td><td>${billQuantity(entry).toLocaleString("en-IN")}</td><td>${money(entry.rate)}</td><td>${money(tax.base)}</td></tr></tbody><tfoot><tr><td colspan="5"><b>Total</b></td><td>${billQuantity(entry).toLocaleString("en-IN")}</td><td></td><td>${money(tax.base)}</td></tr></tfoot></table><div class="print-bottom"><div><h3>Amount In Words</h3><p>${amountWords(tax.total)}</p><h3>Bank Details</h3><p>Name: ${company.bank.name || "Not added"}</p><p>Account No.: ${company.bank.accountNumber || "Not added"}</p><p>IFSC Code: ${company.bank.ifscCode || "Not added"}</p><h3>Terms & Conditions</h3><p>${company.terms || "-"}</p></div><div class="totals"><p><span>Sub Total</span><b>${money(tax.base)}</b></p>${taxRows}<p class="total"><span>Total</span><b>${money(tax.total)}</b></p></div></div><div class="signature"><span>Authorised Signatory</span></div>`;
  $("#documentOverlay").classList.add("show"); $("#documentOverlay").setAttribute("aria-hidden", "false");
}

$$('[data-view]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$("#partyNav").addEventListener("click", () => { resetPartyForm(); $("#partyForm").classList.remove("hidden"); });
$("#saleNav").addEventListener("click", () => { $("#invoiceForm").reset(); $("#invoiceForm").classList.remove("hidden"); updateSaleCalculation("invoice"); });
$("#companyButton").addEventListener("click", () => $("#companyMenu").classList.toggle("show"));
$("#addCompanyMenu").addEventListener("click", () => { setView("companies"); resetCompanyForm(); $("#companyForm").classList.remove("hidden"); });
$("#addCompany").addEventListener("click", () => { resetCompanyForm(); $("#companyForm").classList.remove("hidden"); });
$("#showPartyForm").addEventListener("click", () => { resetPartyForm(); $("#partyForm").classList.remove("hidden"); });
$("#showInvoiceForm").addEventListener("click", () => { $("#invoiceForm").reset(); $("#invoiceForm").classList.remove("hidden"); updateSaleCalculation("invoice"); });
$("#showQuoteForm").addEventListener("click", () => { $("#quoteForm").reset(); $("#quoteForm").classList.remove("hidden"); updateSaleCalculation("quote"); });
$("#quickInvoice").addEventListener("click", () => { setView("sale"); $("#showInvoiceForm").click(); });

$("#companyList").addEventListener("click", (event) => { const use = event.target.closest("[data-company-id]"); const edit = event.target.closest("[data-company-edit]"); if (use) { state.activeCompanyId = use.dataset.companyId; save(); renderAll(); toast("Company changed."); } if (edit) { const company = state.companies.find((item) => item.id === edit.dataset.companyEdit); if (!company) return; editingCompanyId = company.id; $("#companyFormTitle").textContent = "Edit Company"; $("#companyName").value = company.name; $("#companyGstin").value = company.gstin; $("#companyPhone").value = company.phone; $("#companyAddressLine1").value = company.address.line1 || ""; $("#companyAddressLine2").value = company.address.line2 || ""; $("#companyCity").value = company.address.city || ""; $("#companyState").value = company.address.state || "Tamil Nadu"; $("#companyPincode").value = company.address.pincode || ""; $("#companyBankName").value = company.bank.name || ""; $("#companyAccountNumber").value = company.bank.accountNumber || ""; $("#companyIfscCode").value = company.bank.ifscCode || ""; $("#companyTerms").value = company.terms || ""; $("#companyForm").classList.remove("hidden"); } });
$("#partyList").addEventListener("click", (event) => { const button = event.target.closest("[data-party-edit]"); if (!button) return; const party = partyById(button.dataset.partyEdit); if (!party) return; editingPartyId = party.id; $("#partyForm h2").textContent = "Edit Party Details"; $("#partyName").value = party.name; $("#partyPhone").value = party.phone; $("#partyGstin").value = party.gstin; $("#partyAddressLine1").value = party.address.line1 || ""; $("#partyAddressLine2").value = party.address.line2 || ""; $("#partyCity").value = party.address.city || ""; $("#partyState").value = party.address.state || "Tamil Nadu"; $("#partyPincode").value = party.address.pincode || ""; $("#partyForm").classList.remove("hidden"); });

$("#companyForm").addEventListener("submit", (event) => { event.preventDefault(); const wasEditing = Boolean(editingCompanyId); const company = { id: editingCompanyId || crypto.randomUUID(), name: $("#companyName").value.trim(), gstin: $("#companyGstin").value.trim(), phone: $("#companyPhone").value.trim(), address: addressFrom("company"), bank: { name: $("#companyBankName").value.trim(), accountNumber: $("#companyAccountNumber").value.trim(), ifscCode: $("#companyIfscCode").value.trim() }, terms: $("#companyTerms").value.trim() }; if (wasEditing) Object.assign(state.companies.find((item) => item.id === editingCompanyId), company); else { state.companies.push(company); state.activeCompanyId = company.id; } resetCompanyForm(); $("#companyForm").classList.add("hidden"); save(); renderAll(); toast(wasEditing ? "Company updated." : "Company added."); });
$("#partyForm").addEventListener("submit", (event) => { event.preventDefault(); const party = { id: editingPartyId || crypto.randomUUID(), companyId: state.activeCompanyId, name: $("#partyName").value.trim(), phone: $("#partyPhone").value.trim(), gstin: $("#partyGstin").value.trim(), address: addressFrom("party") }; const wasEditing = Boolean(editingPartyId); if (wasEditing) Object.assign(partyById(editingPartyId), party); else state.parties.push(party); resetPartyForm(); $("#partyForm").classList.add("hidden"); save(); renderAll(); toast(wasEditing ? "Party updated." : "Party details saved."); });

function saveSale(kind) { return (event) => { event.preventDefault(); const isInvoice = kind === "invoice"; const key = isInvoice ? "invoice" : "quote"; const list = isInvoice ? scoped(state.invoices) : scoped(state.quotes); const entry = { number: ref(isInvoice ? state.settings.invoicePrefix : state.settings.quotePrefix, list), companyId: state.activeCompanyId, date: $(`#${key}Date`).value || today(), partyId: $(`#${key}Party`).value, item: $(`#${key}Item`).value.trim(), hsn: $(`#${key}Hsn`).value.trim(), size: $(`#${key}Size`).value.trim(), unit: $(`#${key}Unit`).value, qty: Number($(`#${key}Qty`).value || 1), rate: Number($(`#${key}Rate`).value || 0), tax: Number($(`#${key}Tax`).value || 0), taxType: $(`#${key}TaxType`).value }; if (!entry.partyId) return toast("Add a party first."); (isInvoice ? state.invoices : state.quotes).push(entry); state.transactions.push({ companyId: state.activeCompanyId, date: entry.date, type: isInvoice ? "Sale Invoice" : "Estimate / Quotation", reference: entry.number, partyId: entry.partyId, amount: lineAmount(entry) }); event.target.reset(); event.target.classList.add("hidden"); save(); renderAll(); showDocument(isInvoice ? "invoice" : "quote", entry.number); toast(isInvoice ? "Sale invoice saved." : "Estimate saved."); }; }
$("#invoiceForm").addEventListener("submit", saveSale("invoice")); $("#quoteForm").addEventListener("submit", saveSale("quote"));
$("#settingsForm").addEventListener("submit", (event) => { event.preventDefault(); state.settings = { invoicePrefix: $("#invoicePrefix").value.trim() || "INV", quotePrefix: $("#quotePrefix").value.trim() || "EST", currency: $("#currency").value.trim() || "Rs.", bankName: $("#bankName").value.trim(), accountNumber: $("#accountNumber").value.trim(), ifscCode: $("#ifscCode").value.trim() }; save(); renderAll(); toast("General settings saved."); });
["invoice", "quote"].forEach((kind) => ["Size", "Qty", "Rate", "Unit"].forEach((field) => { $(`#${kind}${field}`).addEventListener("input", () => updateSaleCalculation(kind)); $(`#${kind}${field}`).addEventListener("change", () => updateSaleCalculation(kind)); }));
$("#search").addEventListener("input", () => { const query = $("#search").value.toLowerCase(); $$(".record, tbody tr").forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(query); }); });
$("#invoiceList").addEventListener("click", (event) => { const button = event.target.closest("[data-document-id]"); if (button) showDocument(button.dataset.documentType, button.dataset.documentId); }); $("#quoteList").addEventListener("click", (event) => { const button = event.target.closest("[data-document-id]"); if (button) showDocument(button.dataset.documentType, button.dataset.documentId); }); $("#closeDocument").addEventListener("click", () => { $("#documentOverlay").classList.remove("show"); $("#documentOverlay").setAttribute("aria-hidden", "true"); }); $("#printDocument").addEventListener("click", () => window.print());

renderAll();
