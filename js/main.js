/* רינדור הדף — אין צורך לערוך את הקובץ הזה, המוצרים נמצאים ב-products.js */

const grid = document.getElementById("grid");
const filtersEl = document.getElementById("filters");
const searchEl = document.getElementById("search");
const emptyMsg = document.getElementById("emptyMsg");
const toTop = document.getElementById("toTop");

let activeCategory = "all";

const categoryLabel = (id) =>
  (CATEGORIES.find((c) => c.id === id)?.label || "").replace(/[^֐-׿\s]/g, "").trim();

/* גוון רקע שונה לכל קטגוריה כשאין תמונת מוצר */
const mediaGradients = {
  hair: "linear-gradient(135deg, #fce7f3, #ede9fe)",
  clothing: "linear-gradient(135deg, #ede9fe, #dbeafe)",
  training: "linear-gradient(135deg, #ffedd5, #fce7f3)",
  gear: "linear-gradient(135deg, #d1fae5, #ede9fe)",
};

function renderFilters() {
  filtersEl.innerHTML = "";
  CATEGORIES.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (cat.id === activeCategory ? " active" : "");
    btn.textContent = cat.label;
    btn.setAttribute("role", "tab");
    btn.addEventListener("click", () => {
      activeCategory = cat.id;
      renderFilters();
      renderProducts();
    });
    filtersEl.appendChild(btn);
  });
}

function renderProducts() {
  const term = searchEl.value.trim().toLowerCase();
  const items = PRODUCTS.filter((p) => {
    const inCategory = activeCategory === "all" || p.category === activeCategory;
    const inSearch = !term || (p.name + " " + p.desc).toLowerCase().includes(term);
    return inCategory && inSearch;
  });

  grid.innerHTML = "";
  emptyMsg.hidden = items.length > 0;

  items.forEach((p, i) => {
    const card = document.createElement("article");
    card.className = "card";
    card.style.animationDelay = Math.min(i * 0.04, 0.4) + "s";

    const media = p.image
      ? `<img src="${p.image}" alt="${p.name}" loading="lazy">`
      : `<span aria-hidden="true">${p.emoji}</span>`;

    card.innerHTML = `
      <div class="card-media" style="background:${mediaGradients[p.category] || "#ede9fe"}">
        ${media}
        <span class="card-tag">${categoryLabel(p.category)}</span>
      </div>
      <div class="card-body">
        <h3>${p.name}</h3>
        <p>${p.desc}</p>
        <a class="card-link" href="${p.link}" target="_blank" rel="noopener sponsored">
          🛒 לצפייה והזמנה באלי אקספרס
        </a>
      </div>
    `;
    grid.appendChild(card);
  });
}

searchEl.addEventListener("input", renderProducts);

window.addEventListener("scroll", () => {
  toTop.classList.toggle("show", window.scrollY > 600);
});
toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

renderFilters();
renderProducts();
