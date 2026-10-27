// Team members route: renders the staff list from the data boundary.
import { readDataState } from "./lib/switch.js";
import { memberFixtures } from "./lib/member-fixtures.js";

const rows = memberFixtures(readDataState());

const initials = (name) => name.split(" ")[0][0] + (name.split(" ")[1]?.[0] ?? "");

document.getElementById("count").textContent = `${rows.length} members · ${rows.reduce((n, r) => n + r.seats, 0)} seats`;

const list = document.getElementById("list");
if (rows.length === 0) list.innerHTML = `<p class="muted pad">No members yet.</p>`;
for (const r of rows.slice(0, 50)) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <div class="avatar">${initials(r.name)}</div>
    <div class="who"><div class="name">${r.name}</div><div class="email">${r.email}</div></div>
    <div class="title">${r.title ?? "n/a"}</div>
    <span class="badge badge-${r.status}">${r.status}</span>
    <div class="seats">${r.seats} seats</div>
    <button class="icon-btn more">⋯</button>`;
  list.appendChild(row);
}
