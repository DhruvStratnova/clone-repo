// assets/collection-filters.js
// Client-side filtering for products by gemstone, planet, zodiac

document.addEventListener('DOMContentLoaded', function () {
  const filterForm = document.getElementById('productFilterForm');
  if (!filterForm) return;

  const productGrid = document.getElementById('product-grid');
  if (!productGrid) return;

  function getCheckedValues(name) {
    return Array.from(filterForm.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value);
  }

  function filterProducts() {
    const gemstones = getCheckedValues('gemstone');
    const planets = getCheckedValues('planet');
    const zodiacs = getCheckedValues('zodiac');

    Array.from(productGrid.children).forEach(item => {
      const card = item.querySelector('.card');
      if (!card) return;
      const gem = (card.getAttribute('data-gemstone') || '').split(',');
      const planet = (card.getAttribute('data-planet') || '').split(',');
      const zodiac = (card.getAttribute('data-zodiac') || '').split(',');

      const gemMatch = !gemstones.length || gemstones.some(g => gem.includes(g));
      const planetMatch = !planets.length || planets.some(p => planet.includes(p));
      const zodiacMatch = !zodiacs.length || zodiacs.some(z => zodiac.includes(z));

      if (gemMatch && planetMatch && zodiacMatch) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }

  filterForm.addEventListener('change', filterProducts);
});
