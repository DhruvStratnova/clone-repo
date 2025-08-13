
(function() {
  'use strict';
  
  // OptionPlus Widget v1.0
  // Store: ff17qq-pk
  
  class OptionPlusWidget {
    constructor() {
      this.container = null;
      this.productId = null;
      this.selectedValues = {};
      this.totalPrice = 0;
      
      // Store styling configuration
      this.config = {
        colorSelectionType: 'multi',
        imageSelectionType: 'single',
        colorDisplayType: 'swatches',
        imageDisplayType: 'swatches',
        checkboxDisplayType: 'grid',
        enabledTypes: 'button,dropdown,TextField,colorSwatches,CheckBox,ImgSwatches'.split(',')
      };
      
      this.init();
    }
    
    async init() {
      // Wait for DOM to load
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    }
    
    setup() {
      this.container = document.getElementById('optionplus-container');
      if (!this.container) return;
      
      this.productId = this.container.dataset.productId;
      if (!this.productId) return;
      
      this.loadVariantData();
    }
    
    async loadVariantData() {
      try {
        // Fetch variant data from Shopify metafields
        const shopDomain = window.Shopify?.shop || 'demo.myshopify.com';
        
        // Try to get data from existing metafields first
        if (window.Shopify && window.Shopify.theme && window.Shopify.theme.id) {
          // Check if metafield data is available in the page
          const metafieldScript = document.querySelector('script[data-optionplus-variants]');
          if (metafieldScript) {
            const data = JSON.parse(metafieldScript.textContent);
            if (data.variants && data.variants.length > 0) {
              this.renderVariants(data.variants);
              return;
            }
          }
        }
        
        // Fallback: fetch from your app's API
        const response = await fetch(`/apps/option-plus/api/variants/${this.productId}?shop=${encodeURIComponent(shopDomain)}`);
        const data = await response.json();
        
        if (data.variants && data.variants.length > 0) {
          this.renderVariants(data.variants);
        }
      } catch (error) {
        console.error('OptionPlus: Failed to load variants', error);
        // Show friendly message to users
        this.container.innerHTML = '<p style="color: #666; font-style: italic;">Loading variant options...</p>';
      }
    }
    
    renderVariants(variants) {
      console.log('OptionPlus: Rendering variants:', variants);
      
      const html = variants.map(variant => {
        console.log('Processing variant:', variant.title, 'Type:', variant.selected, 'Values:', variant.values);
        return this.renderVariant(variant);
      }).join('');
      
      this.container.innerHTML = `
        <div class="optionplus-widget">
          ${html}
          <div id="optionplus-price-display"></div>
        </div>
      `;
      
      this.bindEvents();
      this.injectStyles();
    }
    
    renderVariant(variant) {
      // Convert object values to array format
      if (!variant.values) {
        console.warn('OptionPlus: No values for variant', variant.title);
        return '';
      }

      // Convert object to array of [key, value] pairs
      const valuesArray = Object.entries(variant.values);
      variant.valuesArray = valuesArray;

      switch(variant.selected) {
        case 'button':
          return this.renderButtons(variant);
        case 'dropdown':
          return this.renderDropdown(variant);
        case 'colorSwatches':
          return this.renderColorSwatches(variant);
        case 'TextField':
          return this.renderTextField(variant);
        case 'CheckBox':
          return this.renderCheckbox(variant);
        case 'ImgSwatches':
          return this.renderImageSwatches(variant);
        default:
          return '';
      }
    }
    
    renderButtons(variant) {
      const buttons = variant.valuesArray.map(([name, price]) => 
        `<button class="optionplus-btn" data-title="${variant.title}" data-value="${name}" data-price="${price || 0}">
          ${name}
        </button>`
      ).join('');
      
      return `
        <div class="optionplus-section">
          <h4 class="optionplus-title">${variant.title}</h4>
          <div class="optionplus-buttons">${buttons}</div>
        </div>
      `;
    }
    
    renderDropdown(variant) {
      const options = variant.valuesArray.map(([name, price]) =>
        `<option value="${name}" data-price="${price || 0}">${name}</option>`
      ).join('');
      
      return `
        <div class="optionplus-section">
          <h4 class="optionplus-title">${variant.title}</h4>
          <select class="optionplus-select" data-title="${variant.title}">
            <option value="">Select ${variant.title}</option>
            ${options}
          </select>
        </div>
      `;
    }
    
    renderColorSwatches(variant) {
      if (this.config.colorDisplayType === 'dropdown') {
        return this.renderColorDropdown(variant);
      }
      
      const swatches = variant.valuesArray.map(([name, colorCode]) =>
        `<div class="optionplus-color-swatch" 
           style="background-color: ${colorCode}" 
           data-title="${variant.title}" 
           data-value="${name}" 
           data-price="0"
           title="${name}">
        </div>`
      ).join('');
      
      return `
        <div class="optionplus-section">
          <h4 class="optionplus-title">${variant.title}</h4>
          <div class="optionplus-color-swatches">${swatches}</div>
        </div>
      `;
    }
    
    renderColorDropdown(variant) {
      const dropdownId = 'color-dropdown-' + Math.random().toString(36).substr(2, 9);
      const options = variant.valuesArray.map(([name, colorCode]) =>
        `<div class="optionplus-dropdown-option color-option" data-title="${variant.title}" data-value="${name}" data-price="0">
          <div class="color-preview" style="background-color: ${colorCode}; width: 20px; height: 20px; border-radius: 50%; border: 1px solid #ddd; margin-right: 8px;"></div>
          <span>${name}</span>
        </div>`
      ).join('');
      
      return `
        <div class="optionplus-section">
          <h4 class="optionplus-title">${variant.title}</h4>
          <div class="optionplus-searchable-dropdown" data-dropdown-id="${dropdownId}">
            <div class="optionplus-dropdown-header">
              <input type="text" class="optionplus-dropdown-search" placeholder="Search ${variant.title}..." readonly>
              <span class="optionplus-dropdown-arrow">â–¼</span>
            </div>
            <div class="optionplus-dropdown-options" id="${dropdownId}">
              ${options}
            </div>
          </div>
        </div>
      `;
    }
    
    renderTextField(variant) {
      return `
        <div class="optionplus-section">
          <label class="optionplus-title">${variant.title}</label>
          <input type="text" class="optionplus-textfield" data-title="${variant.title}" placeholder="Enter ${variant.title}">
        </div>
      `;
    }
    
    renderCheckbox(variant) {
      if (this.config.checkboxDisplayType === 'dropdown') {
        return this.renderCheckboxDropdown(variant);
      }
      
      const checkboxes = variant.valuesArray.map(([name, price]) =>
        `<label class="optionplus-checkbox-label">
          <input type="checkbox" class="optionplus-checkbox" data-title="${variant.title}" data-value="${name}" data-price="${price || 0}">
          <span>${name}</span>
        </label>`
      ).join('');
      
      return `
        <div class="optionplus-section">
          <h4 class="optionplus-title">${variant.title}</h4>
          <div class="optionplus-checkboxes">${checkboxes}</div>
        </div>
      `;
    }
    
    renderCheckboxDropdown(variant) {
      const dropdownId = 'checkbox-dropdown-' + Math.random().toString(36).substr(2, 9);
      const options = variant.valuesArray.map(([name, price]) =>
        `<div class="optionplus-dropdown-option checkbox-option" data-title="${variant.title}" data-value="${name}" data-price="${price || 0}">
          <input type="checkbox" class="optionplus-dropdown-checkbox" data-title="${variant.title}" data-value="${name}" data-price="${price || 0}">
          <span>${name}</span>
          ${price > 0 ? `<span class="option-price">+$${price}</span>` : ''}
        </div>`
      ).join('');
      
      return `
        <div class="optionplus-section">
          <h4 class="optionplus-title">${variant.title}</h4>
          <div class="optionplus-searchable-dropdown" data-dropdown-id="${dropdownId}">
            <div class="optionplus-dropdown-header">
              <input type="text" class="optionplus-dropdown-search" placeholder="Search ${variant.title}..." readonly>
              <span class="optionplus-dropdown-arrow">â–¼</span>
            </div>
            <div class="optionplus-dropdown-options" id="${dropdownId}">
              ${options}
            </div>
          </div>
        </div>
      `;
    }
    
    renderImageSwatches(variant) {
      if (this.config.imageDisplayType === 'dropdown') {
        return this.renderImageDropdown(variant);
      }
      
      const swatches = variant.valuesArray.map(([imageUrl, name]) =>
        `<div class="optionplus-image-swatch" data-title="${variant.title}" data-value="${name}" data-price="0">
          <img src="${imageUrl}" alt="${name}" loading="lazy">
        </div>`
      ).join('');
      
      return `
        <div class="optionplus-section">
          <h4 class="optionplus-title">${variant.title}</h4>
          <div class="optionplus-image-swatches">${swatches}</div>
        </div>
      `;
    }
    
    renderImageDropdown(variant) {
      const dropdownId = 'image-dropdown-' + Math.random().toString(36).substr(2, 9);
      const options = variant.valuesArray.map(([imageUrl, name]) =>
        `<div class="optionplus-dropdown-option image-option" data-title="${variant.title}" data-value="${name}" data-price="0">
          <img src="${imageUrl}" alt="${name}" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px; margin-right: 8px;">
          <span>${name}</span>
        </div>`
      ).join('');
      
      return `
        <div class="optionplus-section">
          <h4 class="optionplus-title">${variant.title}</h4>
          <div class="optionplus-searchable-dropdown" data-dropdown-id="${dropdownId}">
            <div class="optionplus-dropdown-header">
              <input type="text" class="optionplus-dropdown-search" placeholder="Search ${variant.title}..." readonly>
              <span class="optionplus-dropdown-arrow">â–¼</span>
            </div>
            <div class="optionplus-dropdown-options" id="${dropdownId}">
              ${options}
            </div>
          </div>
        </div>
      `;
    }
    
    bindEvents() {
      this.container.addEventListener('click', (e) => {
        if (e.target.classList.contains('optionplus-btn')) {
          this.handleButtonClick(e.target);
        } else if (e.target.classList.contains('optionplus-color-swatch')) {
          this.handleColorSwatchClick(e.target);
        } else if (e.target.classList.contains('optionplus-image-swatch') || e.target.parentElement?.classList.contains('optionplus-image-swatch')) {
          // Handle both div and img clicks for image swatches
          const swatchElement = e.target.classList.contains('optionplus-image-swatch') ? e.target : e.target.parentElement;
          this.handleImageSwatchClick(swatchElement);
        } else if (e.target.classList.contains('optionplus-dropdown-header') || e.target.parentElement?.classList.contains('optionplus-dropdown-header')) {
          this.handleDropdownHeaderClick(e.target.closest('.optionplus-dropdown-header'));
        } else if (e.target.classList.contains('optionplus-dropdown-option') || e.target.parentElement?.classList.contains('optionplus-dropdown-option')) {
          const option = e.target.classList.contains('optionplus-dropdown-option') ? e.target : e.target.parentElement;
          this.handleDropdownOptionClick(option);
        }
      });
      
      this.container.addEventListener('change', (e) => {
        if (e.target.classList.contains('optionplus-select')) {
          this.handleSelectChange(e.target);
        } else if (e.target.classList.contains('optionplus-checkbox')) {
          this.handleCheckboxChange(e.target);
        } else if (e.target.classList.contains('optionplus-dropdown-checkbox')) {
          this.handleCheckboxChange(e.target);
        } else if (e.target.classList.contains('optionplus-textfield')) {
          this.handleTextfieldChange(e.target);
        }
      });
      
      this.container.addEventListener('input', (e) => {
        if (e.target.classList.contains('optionplus-dropdown-search')) {
          this.handleDropdownSearch(e.target);
        }
      });
      
      // Close dropdowns when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.optionplus-searchable-dropdown')) {
          this.closeAllDropdowns();
        }
      });
      
      // Initialize dropdowns
      this.initializeDropdowns();
    }
    
    initializeDropdowns() {
      const dropdowns = this.container.querySelectorAll('.optionplus-searchable-dropdown');
      dropdowns.forEach(dropdown => {
        const search = dropdown.querySelector('.optionplus-dropdown-search');
        const options = dropdown.querySelector('.optionplus-dropdown-options');
        
        dropdown._isOpen = false;
        dropdown._search = search;
        dropdown._options = options;
      });
    }
    
    handleDropdownHeaderClick(header) {
      const dropdown = header.parentElement;
      const options = dropdown.querySelector('.optionplus-dropdown-options');
      const search = dropdown.querySelector('.optionplus-dropdown-search');
      const arrow = dropdown.querySelector('.optionplus-dropdown-arrow');
      
      if (dropdown._isOpen) {
        options.style.display = 'none';
        search.readOnly = true;
        search.value = '';
        arrow.textContent = 'â–¼';
        dropdown._isOpen = false;
        header.classList.remove('active');
      } else {
        this.closeAllDropdowns();
        options.style.display = 'block';
        search.readOnly = false;
        search.focus();
        arrow.textContent = 'â–²';
        dropdown._isOpen = true;
        header.classList.add('active');
        
        // Reset all options to visible when opening
        const allOptions = options.querySelectorAll('.optionplus-dropdown-option');
        allOptions.forEach(option => {
          option.style.display = 'flex';
        });
        
        // Hide no results message if it exists
        const noResultsMsg = options.querySelector('.no-results-message');
        if (noResultsMsg) {
          noResultsMsg.style.display = 'none';
        }
      }
    }
    
    handleDropdownOptionClick(option) {
      const title = option.dataset.title;
      const value = option.dataset.value;
      const price = parseFloat(option.dataset.price) || 0;
      const dropdown = option.closest('.optionplus-searchable-dropdown');
      const search = dropdown.querySelector('.optionplus-dropdown-search');
      
      if (option.classList.contains('color-option')) {
        this.handleColorDropdownSelect(title, value, price, dropdown, option);
      } else if (option.classList.contains('image-option')) {
        this.handleImageDropdownSelect(title, value, price, dropdown, option);
      } else if (option.classList.contains('checkbox-option')) {
        // Handle checkbox option click - toggle the checkbox
        const checkbox = option.querySelector('.optionplus-dropdown-checkbox');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          // Trigger change event to update selections
          const changeEvent = new Event('change', { bubbles: true });
          checkbox.dispatchEvent(changeEvent);
        }
        return;
      }
    }
    
    handleColorDropdownSelect(title, value, price, dropdown, option) {
      const search = dropdown.querySelector('.optionplus-dropdown-search');
      
      if (this.config.colorSelectionType === 'multi') {
        if (!this.selectedValues[title]) {
          this.selectedValues[title] = [];
        }
        
        if (option.classList.contains('selected')) {
          option.classList.remove('selected');
          const index = this.selectedValues[title].indexOf(value);
          if (index > -1) {
            this.selectedValues[title].splice(index, 1);
          }
        } else {
          option.classList.add('selected');
          if (!this.selectedValues[title].includes(value)) {
            this.selectedValues[title].push(value);
          }
        }
        
        search.value = this.selectedValues[title].join(', ');
      } else {
        // Single selection
        dropdown.querySelectorAll('.optionplus-dropdown-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        search.value = value;
        this.updateSelection(title, value, price);
        this.closeDropdown(dropdown);
      }
      
      this.updatePriceDisplay();
    }
    
    handleImageDropdownSelect(title, value, price, dropdown, option) {
      const search = dropdown.querySelector('.optionplus-dropdown-search');
      
      if (this.config.imageSelectionType === 'multi') {
        if (!this.selectedValues[title]) {
          this.selectedValues[title] = [];
        }
        
        if (option.classList.contains('selected')) {
          option.classList.remove('selected');
          const index = this.selectedValues[title].indexOf(value);
          if (index > -1) {
            this.selectedValues[title].splice(index, 1);
          }
        } else {
          option.classList.add('selected');
          if (!this.selectedValues[title].includes(value)) {
            this.selectedValues[title].push(value);
          }
        }
        
        search.value = this.selectedValues[title].join(', ');
      } else {
        // Single selection
        dropdown.querySelectorAll('.optionplus-dropdown-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        search.value = value;
        this.updateSelection(title, value, price);
        this.closeDropdown(dropdown);
      }
      
      this.updatePriceDisplay();
    }
    
    handleDropdownSearch(search) {
      const dropdown = search.closest('.optionplus-searchable-dropdown');
      const options = dropdown.querySelectorAll('.optionplus-dropdown-option');
      const searchTerm = search.value.toLowerCase();
      
      // Ensure dropdown is open when searching
      if (!dropdown._isOpen) {
        const header = dropdown.querySelector('.optionplus-dropdown-header');
        this.handleDropdownHeaderClick(header);
      }
      
      let visibleCount = 0;
      options.forEach(option => {
        const text = option.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
          option.style.display = 'flex';
          visibleCount++;
        } else {
          option.style.display = 'none';
        }
      });
      
      // Show "No results" message if no options match
      const optionsContainer = dropdown.querySelector('.optionplus-dropdown-options');
      let noResultsMsg = optionsContainer.querySelector('.no-results-message');
      
      if (visibleCount === 0 && searchTerm.length > 0) {
        if (!noResultsMsg) {
          noResultsMsg = document.createElement('div');
          noResultsMsg.className = 'no-results-message';
          noResultsMsg.style.cssText = 'padding: 12px; text-align: center; color: #666; font-style: italic;';
          noResultsMsg.textContent = 'No options found';
          optionsContainer.appendChild(noResultsMsg);
        }
        noResultsMsg.style.display = 'block';
      } else if (noResultsMsg) {
        noResultsMsg.style.display = 'none';
      }
    }
    
    closeAllDropdowns() {
      const dropdowns = this.container.querySelectorAll('.optionplus-searchable-dropdown');
      dropdowns.forEach(dropdown => this.closeDropdown(dropdown));
    }
    
    closeDropdown(dropdown) {
      const options = dropdown.querySelector('.optionplus-dropdown-options');
      const search = dropdown.querySelector('.optionplus-dropdown-search');
      const arrow = dropdown.querySelector('.optionplus-dropdown-arrow');
      const header = dropdown.querySelector('.optionplus-dropdown-header');
      
      options.style.display = 'none';
      search.readOnly = true;
      arrow.textContent = 'â–¼';
      dropdown._isOpen = false;
      header.classList.remove('active');
    }
    
    handleButtonClick(btn) {
      // Remove selected from siblings
      btn.parentElement.querySelectorAll('.optionplus-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      
      this.updateSelection(btn.dataset.title, btn.dataset.value, parseFloat(btn.dataset.price) || 0);
    }
    
    handleColorSwatchClick(swatch) {
      const title = swatch.dataset.title;
      const value = swatch.dataset.value;
      const price = parseFloat(swatch.dataset.price) || 0;
      
      if (this.config.colorSelectionType === 'multi') {
        // Multiple selection mode
        if (!this.selectedValues[title]) {
          this.selectedValues[title] = [];
        }
        
        if (swatch.classList.contains('selected')) {
          // Deselect
          swatch.classList.remove('selected');
          const index = this.selectedValues[title].indexOf(value);
          if (index > -1) {
            this.selectedValues[title].splice(index, 1);
          }
        } else {
          // Select
          swatch.classList.add('selected');
          if (!this.selectedValues[title].includes(value)) {
            this.selectedValues[title].push(value);
          }
        }
      } else {
        // Single selection mode
        swatch.parentElement.querySelectorAll('.optionplus-color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        this.updateSelection(title, value, price);
      }
      
      this.updatePriceDisplay();
    }
    
    handleImageSwatchClick(swatch) {
      const title = swatch.dataset.title;
      const value = swatch.dataset.value;
      const price = parseFloat(swatch.dataset.price) || 0;
      
      if (this.config.imageSelectionType === 'multi') {
        // Multiple selection mode
        if (!this.selectedValues[title]) {
          this.selectedValues[title] = [];
        }
        
        if (swatch.classList.contains('selected')) {
          // Deselect
          swatch.classList.remove('selected');
          const index = this.selectedValues[title].indexOf(value);
          if (index > -1) {
            this.selectedValues[title].splice(index, 1);
          }
        } else {
          // Select
          swatch.classList.add('selected');
          if (!this.selectedValues[title].includes(value)) {
            this.selectedValues[title].push(value);
          }
        }
      } else {
        // Single selection mode
        swatch.parentElement.querySelectorAll('.optionplus-image-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        this.updateSelection(title, value, price);
      }
      
      this.updatePriceDisplay();
    }
    
    handleSelectChange(select) {
      const option = select.options[select.selectedIndex];
      const price = parseFloat(option.dataset.price) || 0;
      
      this.updateSelection(select.dataset.title, select.value, price);
    }
    
    handleCheckboxChange(checkbox) {
      const title = checkbox.dataset.title;
      const value = checkbox.dataset.value;
      const price = parseFloat(checkbox.dataset.price) || 0;
      
      if (!this.selectedValues[title]) {
        this.selectedValues[title] = [];
      }
      
      if (checkbox.checked) {
        // Add to selected values array
        this.selectedValues[title].push(value);
      } else {
        // Remove from selected values array
        const index = this.selectedValues[title].indexOf(value);
        if (index > -1) {
          this.selectedValues[title].splice(index, 1);
        }
      }
      
      this.updatePriceDisplay();
    }
    
    handleTextfieldChange(field) {
      this.updateSelection(field.dataset.title, field.value, 0);
    }
    
    updateSelection(title, value, price) {
      this.selectedValues[title] = { value, price };
      this.updatePriceDisplay();
    }
    
    updatePriceDisplay() {
      this.totalPrice = 0;
      
      // Calculate total price from all selections
      Object.entries(this.selectedValues).forEach(([title, value]) => {
        if (Array.isArray(value)) {
          // Handle arrays for checkboxes, multi-select colors, and multi-select images
          if (value.length > 0) {
            // Check if this is a checkbox field
            const checkboxes = this.container.querySelectorAll(`input[data-title="${title}"][type="checkbox"]`);
            if (checkboxes.length > 0) {
              // For checkboxes, calculate price based on checked items
              checkboxes.forEach(cb => {
                if (cb.checked) {
                  this.totalPrice += parseFloat(cb.dataset.price) || 0;
                }
              });
            } else {
              // For multi-select swatches, check actual selected elements
              const colorSwatches = this.container.querySelectorAll(`[data-title="${title}"].optionplus-color-swatch.selected`);
              const imageSwatches = this.container.querySelectorAll(`[data-title="${title}"].optionplus-image-swatch.selected`);
              
              colorSwatches.forEach(swatch => {
                this.totalPrice += parseFloat(swatch.dataset.price) || 0;
              });
              
              imageSwatches.forEach(swatch => {
                this.totalPrice += parseFloat(swatch.dataset.price) || 0;
              });
            }
          }
        } else if (value && value.price) {
          this.totalPrice += value.price;
        }
      });
      
      const priceDisplay = document.getElementById('optionplus-price-display');
      if (priceDisplay && this.totalPrice > 0) {
        priceDisplay.innerHTML = `<div class="optionplus-price">Cart Price will Increment By: $${this.totalPrice.toFixed(2)}</div>`;
      } else if (priceDisplay) {
        priceDisplay.innerHTML = '';
      }
      
      // Update cart form inputs
      this.updateFormInputs();
    }
    
    updateFormInputs() {
      // Try multiple selectors to find the cart form
      const selectors = [
        'form[action="/cart/add"]',
        'form[action*="/cart/add"]',
        'form.product-form',
        'form#product-form',
        '[data-product-form]',
        'form:has(button[name="add"])',
        'form:has(input[name="id"])'
      ];
      
      let targetForms = [];
      
      for (const selector of selectors) {
        try {
          targetForms = document.querySelectorAll(selector);
          if (targetForms.length > 0) break;
        } catch (e) {
          // Selector not supported, continue
        }
      }

      if (targetForms.length === 0) {
        console.warn("OptionPlus: No cart forms found. Retrying in 1 second...");
        // Retry after 1 second in case the form loads dynamically
        setTimeout(() => this.updateFormInputs(), 1000);
        return;
      }

      targetForms.forEach(form => {
        // Remove existing OptionPlus property inputs
        form.querySelectorAll('input[name^="properties["]:not([data-optionplus-keep])').forEach(input => {
          if (input.name.includes('total_option_price') || 
              Object.keys(this.selectedValues).some(title => input.name.includes(title))) {
            input.remove();
          }
        });

        // Add new property inputs
        Object.entries(this.selectedValues).forEach(([title, value]) => {
          let inputValue = '';
          
          if (Array.isArray(value)) {
            inputValue = value.filter(v => v && v !== '').join(", ");
          } else if (value && typeof value === 'object' && value.value) {
            inputValue = value.value;
          } else if (value) {
            inputValue = value.toString();
          }
          
          if (inputValue && inputValue !== '') {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = `properties[${title}]`;
            input.value = inputValue;
            input.setAttribute('data-optionplus', 'true');
            form.appendChild(input);
          }
        });

        // Add total price input
        if (this.totalPrice > 0) {
          const totalPriceInput = document.createElement("input");
          totalPriceInput.type = "hidden";
          totalPriceInput.name = "properties[total_option_price]";
          totalPriceInput.value = this.totalPrice.toFixed(2);
          totalPriceInput.setAttribute('data-optionplus', 'true');
          form.appendChild(totalPriceInput);
        }
      });

      console.log('OptionPlus: Form inputs updated for', targetForms.length, 'forms:', this.selectedValues);
    }
    
    injectStyles() {
      if (document.getElementById('optionplus-styles')) return;
      
      const styles = `
        <style id="optionplus-styles">
          /* Container Styles */
          .optionplus-widget { 
            max-width: 100%; 
            margin: 1rem auto; 
            font-family: "Neuzeit S", "sans-serif"; 
          }
          
          .optionplus-section {
            margin-bottom: 0.75rem;
            // padding: 0.5rem;
            // background: #f9f9f9;
            border-radius: 8px;
            // border: 1px solid #e0e0e0;
          }

          .optionplus-title {
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 0.4rem;
            color: #333;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          /* Button Grid */
          .optionplus-buttons {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 8px;
            margin-bottom: 0.5rem;
          }

          .optionplus-btn {
            background-color: #ffffff;
            color: #000000;
            border: 2px solid #e0e0e0;
            padding: 12px 16px;
            text-align: center;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.3s ease;
            min-height: 45px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .optionplus-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border-color: #000000;
          }

          .optionplus-btn.selected {
            background-color: #000000 !important;
            color: white !important;
            border-color: #000000 !important;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
          }

          /* Dropdown Styles */
          .optionplus-select {
            background-color: #ffffff;
            color: #000000;
            padding: 12px 16px;
            font-size: 14px;
            cursor: pointer;
            border-radius: 4px;
            border: 2px solid #e0e0e0;
            width: 100%;
            max-width: 300px;
            transition: all 0.3s ease;
          }

          .optionplus-select:focus {
            outline: none;
            border-color: #000000;
            box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
          }

          /* Text Field Styles */
          .optionplus-textfield {
            background-color: #ffffff;
            color: #000000;
            padding: 12px 16px;
            font-size: 14px;
            border: 2px solid #e0e0e0;
            border-radius: 4px;
            width: 100%;
            max-width: 300px;
            transition: all 0.3s ease;
          }

          .optionplus-textfield:focus {
            outline: none;
            border-color: #000000;
            box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
          }

          /* Color Swatches Grid */
          .optionplus-color-swatches {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
            gap: 8px;
            max-width: 500px;
            margin-bottom: 0.5rem;
          }

          .optionplus-color-swatch {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            border: 1px solid #000000;
            transition: all 0.3s ease;
            margin: 0 auto;
          }

          .optionplus-color-swatch:hover {
            transform: scale(1.1);
          }

          .optionplus-color-swatch.selected {
            box-shadow: 0 0 0 3px #000000;
            transform: scale(1.1);
            position: relative;
          }
          
          .optionplus-color-swatch.selected::after {
            content: 'âœ“';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            font-weight: bold;
            font-size: 12px;
          }

          /* Checkbox Grid */
          .optionplus-checkboxes {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 8px;
            margin-bottom: 0.5rem;
          }

          .optionplus-checkbox-label {
            display: flex;
            align-items: center;
            padding: 12px;
            background: white;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
          }

          .optionplus-checkbox-label:hover {
            border-color: #000000;
            background: #f8f9ff;
          }

          .optionplus-checkbox-label input[type="checkbox"] {
            margin-right: 8px;
            transform: scale(1.2);
          }

          /* Image Swatches Grid */
          .optionplus-image-swatches {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
            gap: 8px;
            max-width: 600px;
            margin-bottom: 0.5rem;
          }

          .optionplus-image-swatch {
            width: 60px;
            height: 60px;
            border: 1px solid #000000;
            border-radius: 4px;
            overflow: hidden;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 0 auto;
          }

          .optionplus-image-swatch img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .optionplus-image-swatch:hover {
            transform: scale(1.05);
          }

          .optionplus-image-swatch.selected {
            box-shadow: 0 0 0 3px #000000;
            transform: scale(1.05);
            position: relative;
          }
          
          .optionplus-image-swatch.selected::after {
            content: '';
            position: absolute;
            top: 5px;
            right: 5px;
            background: #000000;
            color: white;
            border-radius: 50%;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: bold;
          }

          /* Searchable Dropdowns */
          .optionplus-searchable-dropdown {
            position: relative;
            width: 100%;
            max-width: 300px;
          }

          .optionplus-dropdown-header {
            position: relative;
            display: flex;
            align-items: center;
            background-color: #ffffff;
            border: 2px solid #e0e0e0;
            border-radius: 4px;
            transition: all 0.3s ease;
            cursor: pointer;
          }

          .optionplus-dropdown-header:hover,
          .optionplus-dropdown-header.active {
            border-color: #000000;
            box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
          }

          .optionplus-dropdown-search {
            flex: 1;
            background: transparent;
            border: none;
            padding: 8px 12px;
            font-size: 14px;
            color: #000000;
            outline: none;
            cursor: pointer;
          }

          .optionplus-dropdown-search:focus {
            cursor: text;
          }

          .optionplus-dropdown-arrow {
            padding: 0 12px;
            color: #666;
            font-size: 12px;
            transition: transform 0.3s ease;
            pointer-events: none;
          }

          .optionplus-dropdown-options {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 2px solid #000000;
            border-top: none;
            border-radius: 0 0 4px 4px;
            max-height: 200px;
            overflow-y: auto;
            overflow-x: hidden;
            z-index: 9999;
            display: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }

          .optionplus-dropdown-option {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            color: #333;
            border-bottom: 1px solid #f0f0f0;
            transition: background-color 0.2s ease;
            display: flex;
            align-items: center;
          }

          .optionplus-dropdown-option:hover {
            background-color: #f8f9ff;
          }

          .optionplus-dropdown-option:last-child {
            border-bottom: none;
          }

          .optionplus-dropdown-option.selected {
            background-color: #e7f3ff;
            color: #000000;
          }

          .optionplus-dropdown-option .option-price {
            margin-left: auto;
            font-size: 12px;
            color: #000000;
            font-weight: 600;
            background: #f0f8ff;
            padding: 2px 6px;
            border-radius: 4px;
          }

          /* Price Display */
          .optionplus-price {
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 14px;
            text-align: center;
            margin-top: 1rem;
            box-shadow: 0 4px 15px rgba(238, 90, 36, 0.3);
          }

          /* Responsive Design */
          @media (max-width: 768px) {
            .optionplus-buttons {
              grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
              gap: 6px;
            }

            .optionplus-color-swatches {
              grid-template-columns: repeat(auto-fit, minmax(50px, 1fr));
              gap: 6px;
            }

            .optionplus-image-swatches {
              grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
              gap: 6px;
            }

            .optionplus-checkboxes {
              grid-template-columns: 1fr;
              gap: 6px;
            }

            .optionplus-section {
              padding: 0.4rem;
              margin-bottom: 0.5rem;
            }

            .optionplus-title {
              font-size: 0.9rem;
              margin-bottom: 0.4rem;
            }

            .optionplus-btn {
              padding: 8px 12px;
              font-size: 12px;
              min-height: 36px;
            }

            .optionplus-color-swatch {
              width: 32px;
              height: 32px;
            }

            .optionplus-image-swatch {
              width: 50px;
              height: 50px;
            }

            .optionplus-searchable-dropdown {
              max-width: 100%;
            }

            .optionplus-dropdown-search {
              padding: 6px 10px;
              font-size: 13px;
            }
          }

          @media (max-width: 480px) {
            .optionplus-buttons {
              grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
              gap: 4px;
            }

            .optionplus-color-swatches {
              grid-template-columns: repeat(auto-fit, minmax(40px, 1fr));
              gap: 4px;
            }

            .optionplus-color-swatch {
              width: 28px;
              height: 28px;
            }

            .optionplus-image-swatch {
              width: 45px;
              height: 45px;
            }

            .optionplus-section {
              padding: 0.3rem;
              margin-bottom: 0.4rem;
            }

            .optionplus-title {
              font-size: 0.8rem;
              font-family: Neuzeit S, sans-serif;
            }

            .optionplus-btn {
              padding: 6px 10px;
              font-size: 11px;
              min-height: 32px;
            }
          }
        </style>
      `;
      
      document.head.insertAdjacentHTML('beforeend', styles);
    }
  }
  
  // Initialize widget
  new OptionPlusWidget();
})();