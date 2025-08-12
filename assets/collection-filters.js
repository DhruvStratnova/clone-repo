// assets/collection-filters.js
// Client-side filtering for products by gemstone, planet, zodiac

document.addEventListener('DOMContentLoaded', function () {
  const filterForm = document.getElementById('productFilterForm');
  if (!filterForm) return;

  const productGrid = document.getElementById('product-grid');
  if (!productGrid) return;

  function getSelectedValue(name) {
    const select = filterForm.querySelector(`select[name="${name}"]`);
    return select ? select.value : '';
  }

  function filterProducts() {
    const gemstone = getSelectedValue('gemstone');
    const planet = getSelectedValue('planet');
    const zodiac = getSelectedValue('zodiac');

    Array.from(productGrid.children).forEach(item => {
      const card = item.querySelector('.card');
      if (!card) return;
      const gem = (card.getAttribute('data-gemstone') || '').split(',');
      const planetVal = (card.getAttribute('data-planet') || '').split(',');
      const zodiacVal = (card.getAttribute('data-zodiac') || '').split(',');

      const gemMatch = !gemstone || gem.includes(gemstone);
      const planetMatch = !planet || planetVal.includes(planet);
      const zodiacMatch = !zodiac || zodiacVal.includes(zodiac);

      if (gemMatch && planetMatch && zodiacMatch) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }

  filterForm.addEventListener('change', filterProducts);
});
