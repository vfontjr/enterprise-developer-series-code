/**
 * Formidable Forms Performance Optimization Module
 * Advanced performance features for handling large forms efficiently
 * Includes: Lazy loading, field virtualization, progressive enhancement, and caching
 * 
 * @author Headless WordPress, Formidable Power
 * @version 2.0
 */

class FormidablePerformanceOptimizer {
  constructor(options = {}) {
    this.config = {
      // Lazy Loading
      lazyLoadThreshold: options.lazyLoadThreshold || 10, // Fields to load initially
      lazyLoadBuffer: options.lazyLoadBuffer || 5, // Fields to load ahead
      enableVirtualization: options.enableVirtualization !== false,
      virtualScrollHeight: options.virtualScrollHeight || 5000,
      
      // Chunking
      chunkSize: options.chunkSize || 20,
      chunkDelay: options.chunkDelay || 16, // ~60fps
      
      // Caching
      enableCache: options.enableCache !== false,
      cacheExpiry: options.cacheExpiry || 3600000, // 1 hour
      
      // Progressive Enhancement
      enableProgressive: options.enableProgressive !== false,
      priorityFields: options.priorityFields || [],
      
      // Resource Management
      deferImages: options.deferImages !== false,
      deferScripts: options.deferScripts !== false,
      compressData: options.compressData !== false,
      
      // Performance Monitoring
      enableMetrics: options.enableMetrics || false,
      metricsCallback: options.metricsCallback || null
    };
    
    this.cache = new Map();
    this.observers = new Map();
    this.loadedFields = new Set();
    this.fieldQueue = [];
    this.metrics = {
      startTime: 0,
      fieldRenderTimes: [],
      totalRenderTime: 0,
      lazyLoadedCount: 0,
      cachedLoads: 0
    };
  }

  /**
   * Initialize performance optimizations for a form
   */
  async initializeForm(form, fields, formData) {
    if (this.config.enableMetrics) {
      this.metrics.startTime = performance.now();
    }

    // Sort fields by priority and order
    const sortedFields = this.prioritizeFields(fields);
    
    // Determine loading strategy based on form size
    const strategy = this.determineLoadingStrategy(sortedFields.length);
    
    if (strategy === 'lazy') {
      return await this.lazyLoadForm(form, sortedFields, formData);
    } else if (strategy === 'chunked') {
      return await this.chunkedLoadForm(form, sortedFields, formData);
    } else if (strategy === 'virtual') {
      return await this.virtualizedForm(form, sortedFields, formData);
    } else {
      return await this.standardLoadForm(form, sortedFields, formData);
    }
  }

  /**
   * Determine optimal loading strategy based on form size
   */
  determineLoadingStrategy(fieldCount) {
    if (fieldCount <= 20) return 'standard';
    if (fieldCount <= 50) return 'chunked';
    if (fieldCount <= 100) return 'lazy';
    return 'virtual';
  }

  /**
   * Prioritize fields for loading order
   */
  prioritizeFields(fields) {
    const priorityMap = new Map(
      this.config.priorityFields.map((key, index) => [key, index])
    );
    
    return fields.sort((a, b) => {
      // Priority fields first
      const aPriority = priorityMap.get(a.field_key) ?? Infinity;
      const bPriority = priorityMap.get(b.field_key) ?? Infinity;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Required fields next
      if (a.required !== b.required) {
        return b.required === '1' ? 1 : -1;
      }
      
      // Then by field order
      return parseInt(a.field_order) - parseInt(b.field_order);
    });
  }

  /**
   * Lazy Load Implementation
   */
  async lazyLoadForm(form, fields, formData) {
    const container = document.createElement('div');
    container.className = 'frm_lazy_container';
    
    // Load initial fields
    const initialFields = fields.slice(0, this.config.lazyLoadThreshold);
    const remainingFields = fields.slice(this.config.lazyLoadThreshold);
    
    // Render initial fields immediately
    for (const field of initialFields) {
      const element = await this.renderFieldAsync(field, formData);
      if (element) {
        container.appendChild(element);
        this.loadedFields.add(field.id);
      }
    }
    
    form.appendChild(container);
    
    // Create placeholders for remaining fields
    for (const field of remainingFields) {
      const placeholder = this.createFieldPlaceholder(field);
      container.appendChild(placeholder);
      
      // Set up intersection observer for lazy loading
      this.observeFieldForLazyLoad(placeholder, field, formData);
    }
    
    // Initialize visible fields
    this.initializeVisibleFields(form);
    
    return {
      loaded: initialFields.length,
      total: fields.length,
      strategy: 'lazy'
    };
  }

  /**
   * Create placeholder for lazy-loaded field
   */
  createFieldPlaceholder(field) {
    const placeholder = document.createElement('div');
    placeholder.className = 'frm_field_placeholder';
    placeholder.id = `placeholder_${field.id}`;
    placeholder.style.minHeight = this.estimateFieldHeight(field) + 'px';
    placeholder.setAttribute('data-field-id', field.id);
    placeholder.setAttribute('data-field-type', field.type);
    
    // Add loading skeleton
    placeholder.innerHTML = `
      <div class="frm_skeleton">
        <div class="frm_skeleton_label"></div>
        <div class="frm_skeleton_input"></div>
      </div>
    `;
    
    return placeholder;
  }

  /**
   * Estimate field height for placeholder
   */
  estimateFieldHeight(field) {
    const heights = {
      'text': 85,
      'email': 85,
      'number': 85,
      'select': 85,
      'radio': 120,
      'checkbox': 120,
      'textarea': 150,
      'address': 300,
      'name': 85,
      'divider': 60,
      'html': 100,
      'hidden': 0,
      'captcha': 80,
      'submit': 70
    };
    
    return heights[field.type] || 85;
  }

  /**
   * Set up intersection observer for field
   */
  observeFieldForLazyLoad(placeholder, field, formData) {
    if (!('IntersectionObserver' in window)) {
      // Fallback for browsers without IntersectionObserver
      this.loadFieldImmediately(placeholder, field, formData);
      return;
    }
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadField(placeholder, field, formData);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: `${this.config.lazyLoadBuffer * 50}px`,
        threshold: 0.01
      }
    );
    
    observer.observe(placeholder);
    this.observers.set(field.id, observer);
  }

  /**
   * Load a field when it becomes visible
   */
  async loadField(placeholder, field, formData) {
    if (this.loadedFields.has(field.id)) return;
    
    const startTime = performance.now();
    
    try {
      // Check cache first
      const cached = this.getFromCache(`field_${field.id}`);
      if (cached) {
        placeholder.replaceWith(cached.cloneNode(true));
        this.metrics.cachedLoads++;
        return;
      }
      
      // Render the field
      const element = await this.renderFieldAsync(field, formData);
      
      if (element) {
        // Fade in animation
        element.style.opacity = '0';
        placeholder.replaceWith(element);
        
        // Trigger reflow and animate
        requestAnimationFrame(() => {
          element.style.transition = 'opacity 0.3s ease-in-out';
          element.style.opacity = '1';
        });
        
        // Cache the rendered element
        this.addToCache(`field_${field.id}`, element.cloneNode(true));
        
        // Initialize field behaviors
        this.initializeField(element, field);
        
        this.loadedFields.add(field.id);
        
        if (this.config.enableMetrics) {
          const renderTime = performance.now() - startTime;
          this.metrics.fieldRenderTimes.push(renderTime);
          this.metrics.lazyLoadedCount++;
        }
      }
    } catch (error) {
      console.error(`Failed to load field ${field.id}:`, error);
      placeholder.innerHTML = `
        <div class="frm_error_msg">
          Failed to load field. Please refresh the page.
        </div>
      `;
    }
  }

  /**
   * Chunked Loading Implementation
   */
  async chunkedLoadForm(form, fields, formData) {
    const container = document.createElement('div');
    container.className = 'frm_chunked_container';
    form.appendChild(container);
    
    // Create progress indicator
    const progress = this.createProgressIndicator(fields.length);
    form.insertBefore(progress, container);
    
    let loaded = 0;
    
    // Process fields in chunks
    for (let i = 0; i < fields.length; i += this.config.chunkSize) {
      const chunk = fields.slice(i, i + this.config.chunkSize);
      
      await this.processChunk(chunk, container, formData);
      
      loaded += chunk.length;
      this.updateProgress(progress, loaded, fields.length);
      
      // Allow browser to breathe between chunks
      if (i + this.config.chunkSize < fields.length) {
        await this.delay(this.config.chunkDelay);
      }
    }
    
    // Remove progress indicator
    progress.remove();
    
    // Initialize all fields
    this.initializeAllFields(form);
    
    return {
      loaded: fields.length,
      total: fields.length,
      strategy: 'chunked'
    };
  }

  /**
   * Process a chunk of fields
   */
  async processChunk(chunk, container, formData) {
    const fragment = document.createDocumentFragment();
    
    const renderPromises = chunk.map(field => 
      this.renderFieldAsync(field, formData)
    );
    
    const elements = await Promise.all(renderPromises);
    
    elements.forEach(element => {
      if (element) {
        fragment.appendChild(element);
      }
    });
    
    container.appendChild(fragment);
  }

  /**
   * Virtualized Form Implementation
   */
  async virtualizedForm(form, fields, formData) {
    const viewport = document.createElement('div');
    viewport.className = 'frm_virtual_viewport';
    viewport.style.height = `${this.config.virtualScrollHeight}px`;
    viewport.style.overflow = 'auto';
    viewport.style.position = 'relative';
    
    const content = document.createElement('div');
    content.className = 'frm_virtual_content';
    content.style.position = 'relative';
    
    // Calculate total height
    const totalHeight = fields.reduce((sum, field) => 
      sum + this.estimateFieldHeight(field), 0
    );
    content.style.height = `${totalHeight}px`;
    
    viewport.appendChild(content);
    form.appendChild(viewport);
    
    // Track visible range
    let visibleStart = 0;
    let visibleEnd = 10;
    const renderedFields = new Map();
    
    // Render initial visible fields
    await this.renderVisibleRange(
      fields, 
      visibleStart, 
      visibleEnd, 
      content, 
      renderedFields, 
      formData
    );
    
    // Handle scroll events with throttling
    let scrollTimeout;
    viewport.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(async () => {
        const scrollTop = viewport.scrollTop;
        const viewportHeight = viewport.clientHeight;
        
        // Calculate new visible range
        const newStart = Math.floor(scrollTop / 85); // Average field height
        const newEnd = Math.ceil((scrollTop + viewportHeight) / 85) + 2;
        
        if (newStart !== visibleStart || newEnd !== visibleEnd) {
          visibleStart = Math.max(0, newStart - 2);
          visibleEnd = Math.min(fields.length, newEnd + 2);
          
          await this.renderVisibleRange(
            fields,
            visibleStart,
            visibleEnd,
            content,
            renderedFields,
            formData
          );
          
          // Clean up fields outside visible range
          this.cleanupInvisibleFields(renderedFields, visibleStart, visibleEnd);
        }
      }, 50);
    });
    
    return {
      loaded: visibleEnd - visibleStart,
      total: fields.length,
      strategy: 'virtual'
    };
  }

  /**
   * Render visible range of fields in virtual scroll
   */
  async renderVisibleRange(fields, start, end, container, renderedFields, formData) {
    let currentY = 0;
    
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const height = this.estimateFieldHeight(field);
      
      if (i >= start && i < end) {
        if (!renderedFields.has(i)) {
          const element = await this.renderFieldAsync(field, formData);
          if (element) {
            element.style.position = 'absolute';
            element.style.top = `${currentY}px`;
            element.style.width = '100%';
            container.appendChild(element);
            renderedFields.set(i, element);
            this.initializeField(element, field);
          }
        }
      }
      
      currentY += height;
    }
  }

  /**
   * Clean up fields outside visible range
   */
  cleanupInvisibleFields(renderedFields, visibleStart, visibleEnd) {
    const buffer = 5; // Keep some fields outside visible range
    
    renderedFields.forEach((element, index) => {
      if (index < visibleStart - buffer || index > visibleEnd + buffer) {
        element.remove();
        renderedFields.delete(index);
      }
    });
  }

  /**
   * Standard loading (for small forms)
   */
  async standardLoadForm(form, fields, formData) {
    const fragment = document.createDocumentFragment();
    
    for (const field of fields) {
      const element = await this.renderFieldAsync(field, formData);
      if (element) {
        fragment.appendChild(element);
      }
    }
    
    form.appendChild(fragment);
    this.initializeAllFields(form);
    
    return {
      loaded: fields.length,
      total: fields.length,
      strategy: 'standard'
    };
  }

  /**
   * Async field rendering with performance optimization
   */
  async renderFieldAsync(field, formData) {
    return new Promise((resolve) => {
      // Use requestIdleCallback if available
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          const element = this.renderField(field, formData);
          resolve(element);
        }, { timeout: 100 });
      } else {
        // Fallback to setTimeout
        setTimeout(() => {
          const element = this.renderField(field, formData);
          resolve(element);
        }, 0);
      }
    });
  }

  /**
   * Render a single field (delegates to main renderer)
   */
  renderField(field, formData) {
    // This would call the main FormidableFormRendererEngine
    // For this example, we'll create a simple placeholder
    const container = document.createElement('div');
    container.className = `frm_form_field frm_${field.type}_container`;
    container.id = `frm_field_${field.id}_container`;
    
    // Add basic field structure
    if (field.name && field.type !== 'hidden') {
      const label = document.createElement('label');
      label.className = 'frm_primary_label';
      label.textContent = field.name;
      container.appendChild(label);
    }
    
    // Add field-specific elements based on type
    const input = this.createFieldInput(field);
    if (input) {
      container.appendChild(input);
    }
    
    return container;
  }

  /**
   * Create appropriate input element for field type
   */
  createFieldInput(field) {
    const inputTypes = {
      'text': 'input',
      'email': 'input',
      'number': 'input',
      'textarea': 'textarea',
      'select': 'select',
      'checkbox': 'input',
      'radio': 'input',
      'hidden': 'input'
    };
    
    const elementType = inputTypes[field.type] || 'input';
    const element = document.createElement(elementType);
    
    if (elementType === 'input') {
      element.type = field.type === 'checkbox' || field.type === 'radio' 
        ? field.type 
        : field.type === 'hidden' ? 'hidden' : 'text';
    }
    
    element.name = `item_meta[${field.id}]`;
    element.id = `field_${field.field_key}`;
    
    if (field.required === '1') {
      element.required = true;
    }
    
    return element;
  }

  /**
   * Initialize field behaviors after rendering
   */
  initializeField(element, field) {
    // Defer non-critical initializations
    requestIdleCallback(() => {
      // Initialize field-specific behaviors
      if (field.type === 'date') {
        this.initializeDatePicker(element);
      } else if (field.type === 'file' || field.type === 'image') {
        this.initializeFileUpload(element);
      } else if (field.type === 'star') {
        this.initializeStarRating(element);
      }
      
      // Apply conditional logic if needed
      if (field.field_options?.hide_field?.length) {
        this.applyConditionalLogic(element, field);
      }
    });
  }

  /**
   * Initialize all fields after loading
   */
  initializeAllFields(form) {
    // Batch DOM reads and writes
    const fields = form.querySelectorAll('.frm_form_field');
    const updates = [];
    
    // Read phase
    fields.forEach(field => {
      const rect = field.getBoundingClientRect();
      updates.push({ field, rect });
    });
    
    // Write phase
    requestAnimationFrame(() => {
      updates.forEach(({ field, rect }) => {
        // Apply any position-based optimizations
        if (rect.top < window.innerHeight) {
          field.classList.add('frm_visible');
        }
      });
    });
  }

  /**
   * Progressive Enhancement Features
   */
  
  /**
   * Initialize date picker progressively
   */
  initializeDatePicker(element) {
    const input = element.querySelector('input[type="date"]');
    if (!input) return;
    
    // Check for native date picker support
    if (input.type === 'date') {
      // Native support exists
      return;
    }
    
    // Load polyfill if needed
    this.loadPolyfill('datepicker', () => {
      // Initialize date picker polyfill
      if (window.flatpickr) {
        flatpickr(input, {
          dateFormat: 'Y-m-d',
          allowInput: true
        });
      }
    });
  }

  /**
   * Initialize file upload with optimization
   */
  initializeFileUpload(element) {
    const input = element.querySelector('input[type="file"]');
    if (!input) return;
    
    // Add drag and drop support
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      element.classList.add('frm_dragover');
    });
    
    element.addEventListener('dragleave', () => {
      element.classList.remove('frm_dragover');
    });
    
    element.addEventListener('drop', (e) => {
      e.preventDefault();
      element.classList.remove('frm_dragover');
      
      if (e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        this.handleFileSelection(input);
      }
    });
    
    // Optimize file handling
    input.addEventListener('change', () => {
      this.handleFileSelection(input);
    });
  }

  /**
   * Handle file selection with optimization
   */
  handleFileSelection(input) {
    const files = Array.from(input.files);
    
    // Validate file sizes
    const maxSize = 10 * 1024 * 1024; // 10MB
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        this.showError(`File ${file.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });
    
    // Preview images if applicable
    if (input.accept && input.accept.includes('image')) {
      this.previewImages(validFiles, input.parentElement);
    }
    
    // Compress images if needed
    if (this.config.compressData && validFiles.some(f => f.type.startsWith('image/'))) {
      this.compressImages(validFiles).then(compressed => {
        // Update file input with compressed files
        const dt = new DataTransfer();
        compressed.forEach(file => dt.items.add(file));
        input.files = dt.files;
      });
    }
  }

  /**
   * Preview images with lazy loading
   */
  previewImages(files, container) {
    let preview = container.querySelector('.frm_image_preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'frm_image_preview';
      container.appendChild(preview);
    }
    
    preview.innerHTML = '';
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.className = 'frm_preview_image';
          img.loading = 'lazy';
          img.width = 100;
          img.height = 100;
          preview.appendChild(img);
        };
        
        reader.readAsDataURL(file);
      }
    });
  }

  /**
   * Compress images before upload
   */
  async compressImages(files) {
    const compressed = [];
    
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const compressedFile = await this.compressImage(file);
        compressed.push(compressedFile);
      } else {
        compressed.push(file);
      }
    }
    
    return compressed;
  }

  /**
   * Compress a single image
   */
  compressImage(file, maxWidth = 1920, quality = 0.8) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Calculate new dimensions
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw and compress
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob(
            (blob) => {
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now()
              });
              resolve(compressedFile);
            },
            file.type,
            quality
          );
        };
        
        img.src = e.target.result;
      };
      
      reader.readAsDataURL(file);
    });
  }

  /**
   * Initialize star rating with optimization
   */
  initializeStarRating(element) {
    const stars = element.querySelectorAll('.frm_star');
    const inputs = element.querySelectorAll('input[type="radio"]');
    
    // Use event delegation for better performance
    element.addEventListener('click', (e) => {
      if (e.target.matches('.frm_star') || e.target.matches('input[type="radio"]')) {
        this.updateStarRating(element);
      }
    });
    
    element.addEventListener('mouseenter', (e) => {
      if (e.target.matches('.frm_star')) {
        this.previewStarRating(element, e.target);
      }
    }, true);
  }

  /**
   * Update star rating display
   */
  updateStarRating(container) {
    const checked = container.querySelector('input[type="radio"]:checked');
    const stars = container.querySelectorAll('.frm_star');
    
    if (checked) {
      const rating = parseInt(checked.value);
      stars.forEach((star, index) => {
        star.classList.toggle('frm_star_active', index < rating);
      });
    }
  }

  /**
   * Preview star rating on hover
   */
  previewStarRating(container, hoveredStar) {
    const stars = Array.from(container.querySelectorAll('.frm_star'));
    const index = stars.indexOf(hoveredStar);
    
    stars.forEach((star, i) => {
      star.classList.toggle('frm_star_hover', i <= index);
    });
  }

  /**
   * Apply conditional logic with optimization
   */
  applyConditionalLogic(element, field) {
    // Debounce conditional logic checks
    let timeout;
    const checkConditions = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        this.evaluateConditions(element, field);
      }, 100);
    };
    
    // Set up listeners with event delegation
    const form = element.closest('form');
    if (form) {
      form.addEventListener('input', checkConditions);
      form.addEventListener('change', checkConditions);
    }
  }

  /**
   * Evaluate conditional logic
   */
  evaluateConditions(element, field) {
    // Implementation would check conditions and show/hide field
    // This is a placeholder for the actual logic
    console.log('Evaluating conditions for field:', field.id);
  }

  /**
   * Caching Utilities
   */
  
  /**
   * Add item to cache
   */
  addToCache(key, value) {
    if (!this.config.enableCache) return;
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
    
    // Clean old cache entries
    this.cleanCache();
  }

  /**
   * Get item from cache
   */
  getFromCache(key) {
    if (!this.config.enableCache) return null;
    
    const cached = this.cache.get(key);
    
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.config.cacheExpiry) {
        return cached.value;
      } else {
        this.cache.delete(key);
      }
    }
    
    return null;
  }

  /**
   * Clean expired cache entries
   */
  cleanCache() {
    const now = Date.now();
    
    this.cache.forEach((value, key) => {
      if (now - value.timestamp > this.config.cacheExpiry) {
        this.cache.delete(key);
      }
    });
  }

  /**
   * Resource Loading Utilities
   */
  
  /**
   * Load polyfill dynamically
   */
  loadPolyfill(name, callback) {
    const polyfills = {
      'datepicker': 'https://cdn.jsdelivr.net/npm/flatpickr',
      'intersectionObserver': 'https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserver'
    };
    
    const url = polyfills[name];
    if (!url) {
      callback();
      return;
    }
    
    // Check if already loaded
    if (document.querySelector(`script[data-polyfill="${name}"]`)) {
      callback();
      return;
    }
    
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-polyfill', name);
    script.onload = callback;
    script.onerror = () => {
      console.error(`Failed to load polyfill: ${name}`);
      callback();
    };
    
    document.head.appendChild(script);
  }

  /**
   * UI Helper Methods
   */
  
  /**
   * Create progress indicator
   */
  createProgressIndicator(total) {
    const container = document.createElement('div');
    container.className = 'frm_progress_container';
    container.innerHTML = `
      <div class="frm_progress_bar">
        <div class="frm_progress_fill" style="width: 0%"></div>
      </div>
      <div class="frm_progress_text">Loading form: 0 / ${total} fields</div>
    `;
    return container;
  }

  /**
   * Update progress indicator
   */
  updateProgress(container, loaded, total) {
    const fill = container.querySelector('.frm_progress_fill');
    const text = container.querySelector('.frm_progress_text');
    
    const percentage = (loaded / total) * 100;
    fill.style.width = `${percentage}%`;
    text.textContent = `Loading form: ${loaded} / ${total} fields`;
    
    if (loaded === total) {
      container.classList.add('frm_progress_complete');
      setTimeout(() => {
        container.style.opacity = '0';
      }, 500);
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const error = document.createElement('div');
    error.className = 'frm_error_toast';
    error.textContent = message;
    document.body.appendChild(error);
    
    setTimeout(() => {
      error.classList.add('frm_fade_out');
      setTimeout(() => error.remove(), 300);
    }, 3000);
  }

  /**
   * Utility Methods
   */
  
  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Throttle function calls
   */
  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Debounce function calls
   */
  debounce(func, wait) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }

  /**
   * Performance Metrics
   */
  
  /**
   * Get performance metrics
   */
  getMetrics() {
    if (!this.config.enableMetrics) return null;
    
    const endTime = performance.now();
    this.metrics.totalRenderTime = endTime - this.metrics.startTime;
    
    // Calculate averages
    const avgFieldRenderTime = this.metrics.fieldRenderTimes.length > 0
      ? this.metrics.fieldRenderTimes.reduce((a, b) => a + b, 0) / this.metrics.fieldRenderTimes.length
      : 0;
    
    return {
      ...this.metrics,
      avgFieldRenderTime,
      cacheHitRate: this.metrics.cachedLoads / (this.metrics.lazyLoadedCount || 1)
    };
  }

  /**
   * Log performance metrics
   */
  logMetrics() {
    const metrics = this.getMetrics();
    if (metrics) {
      console.group('Formidable Form Performance Metrics');
      console.log('Total Render Time:', metrics.totalRenderTime.toFixed(2) + 'ms');
      console.log('Average Field Render Time:', metrics.avgFieldRenderTime.toFixed(2) + 'ms');
      console.log('Lazy Loaded Fields:', metrics.lazyLoadedCount);
      console.log('Cache Hit Rate:', (metrics.cacheHitRate * 100).toFixed(1) + '%');
      console.groupEnd();
      
      if (this.config.metricsCallback) {
        this.config.metricsCallback(metrics);
      }
    }
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    // Clean up observers
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    
    // Clear cache
    this.cache.clear();
    
    // Clear loaded fields
    this.loadedFields.clear();
    
    // Reset metrics
    this.metrics = {
      startTime: 0,
      fieldRenderTimes: [],
      totalRenderTime: 0,
      lazyLoadedCount: 0,
      cachedLoads: 0
    };
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormidablePerformanceOptimizer;
} else if (typeof define === 'function' && define.amd) {
  define([], () => FormidablePerformanceOptimizer);
} else {
  window.FormidablePerformanceOptimizer = FormidablePerformanceOptimizer;
}