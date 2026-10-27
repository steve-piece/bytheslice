// Fixture sets for the team table, one per data state. Values are realistic or schema-backed (name 120, email 254, title 80).
const demo = [
  { name: "Priya Raman", email: "priya.raman@northwind.example", title: "Operations lead", status: "active", seats: 3 },
  { name: "Marcus Webb", email: "marcus.webb@northwind.example", title: "Field technician", status: "active", seats: 1 },
  { name: "Elena Sokolova", email: "elena.s@northwind.example", title: "Dispatcher", status: "invited", seats: 1 },
  { name: "Tomás Ibarra", email: "tomas.ibarra@northwind.example", title: "Safety officer", status: "expired", seats: 2 },
];

const worst = [
  { name: "Aleksandra Wiśniewska-Kowalczyk", email: "aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com", title: "Senior Regional Compliance and Safety Coordinator, Western Operations", status: "active", seats: 12 },
  { name: "Bartholomew Fitzgerald Montgomery III", email: "bartholomew.fitzgerald@northwind-industries-holdings.example.com", title: "Field technician", status: "invited", seats: 1 },
  { name: "Jo", email: "jo@nw.example", title: "", status: "active", seats: 0 },
  { name: "Nguyễn Thị Minh Khai", email: "khai.nguyen@northwind.example", status: "expired", seats: 1 },
  { name: "王秀英", email: "xiuying.wang@northwind.example", title: "调度员", status: "active", seats: 1 },
  { name: "🌵 Desert Crew Bot", email: "desert-crew-bot@automation.northwind.example", title: "Service account", status: "active", seats: 9999 },
];

const firsts = ["Priya", "Marcus", "Elena", "Tomás", "Grace", "Kwame", "Hana", "Luis", "Mei", "Oskar"];
const lasts = ["Raman", "Webb", "Sokolova", "Ibarra", "Okafor", "Mensah", "Sato", "Ortega", "Lin", "Berg"];
const statuses = ["active", "active", "active", "invited", "expired"];
const many = Array.from({ length: 1284 }, (_, i) => {
  const first = firsts[i % 10], last = lasts[Math.floor(i / 10) % 10];
  return { name: `${first} ${last}`, email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@northwind.example`, title: i % 7 ? "Field technician" : "Dispatcher", status: statuses[i % 5], seats: (i % 4) + 1 };
});

export function memberFixtures(state) {
  if (state === "empty") return [];
  if (state === "one") return demo.slice(0, 1);
  if (state === "worst") return worst;
  if (state === "many") return many;
  return demo;
}
