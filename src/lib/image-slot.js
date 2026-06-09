/**
 * <image-slot> — minimal user-fillable image placeholder.
 *
 * A standalone replacement for the prototype's drag-drop slot. Click or drop
 * an image to fill it; the choice persists in localStorage keyed by `id`.
 *
 * TODO (Supabase migration): replace localStorage persistence with a
 * Supabase Storage upload (bucket per account) and store the public/signed
 * URL on the profile record. See README "Phase 2 — Supabase".
 *
 * Attributes:
 *   id           Persistence key (required for the fill to survive reloads).
 *   shape        'rect' | 'rounded' | 'circle' | 'pill'  (default 'rounded')
 *   fit          'cover' | 'contain'                      (default 'cover')
 *   placeholder  Helper text shown when empty.
 *
 * Styling hooks (set by the host CSS):
 *   --image-slot-bg, --image-slot-border, --image-slot-fg
 */
const RADIUS = { rect: '0', rounded: '12px', circle: '50%', pill: '999px' };

class ImageSlot extends HTMLElement {
  connectedCallback() {
    if (this._wired) return;
    this._wired = true;

    const shape = this.getAttribute('shape') || 'rounded';
    const fit = this.getAttribute('fit') || 'cover';
    const placeholder = this.getAttribute('placeholder') || 'Add image';
    const key = this.getAttribute('id') ? `image-slot:${this.getAttribute('id')}` : null;

    this.style.display = this.style.display || 'block';
    this.style.position = 'relative';
    this.style.overflow = 'hidden';
    this.style.borderRadius = RADIUS[shape] || RADIUS.rounded;
    this.style.background = 'var(--image-slot-bg, rgba(0,0,0,0.04))';
    this.style.border = '1px dashed var(--image-slot-border, rgba(0,0,0,0.15))';
    this.style.cursor = 'pointer';

    this._img = document.createElement('img');
    Object.assign(this._img.style, {
      width: '100%', height: '100%', objectFit: fit, display: 'none',
    });
    this.appendChild(this._img);

    this._hint = document.createElement('span');
    this._hint.textContent = placeholder;
    Object.assign(this._hint.style, {
      position: 'absolute', inset: '0', display: 'flex',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: '8px', font: '500 11px/1.3 Inter, sans-serif',
      color: 'var(--image-slot-fg, #7a6f88)', pointerEvents: 'none',
    });
    this.appendChild(this._hint);

    this._input = document.createElement('input');
    this._input.type = 'file';
    this._input.accept = 'image/*';
    this._input.style.display = 'none';
    this.appendChild(this._input);

    this.addEventListener('click', () => this._input.click());
    this._input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) this._readFile(file);
    });
    this.addEventListener('dragover', (e) => { e.preventDefault(); });
    this.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) this._readFile(file);
    });

    if (key) {
      try {
        const saved = localStorage.getItem(key);
        if (saved) this._setSrc(saved);
      } catch { /* ignore */ }
    }
  }

  _readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      this._setSrc(src);
      const id = this.getAttribute('id');
      if (id) {
        try { localStorage.setItem(`image-slot:${id}`, src); } catch { /* quota */ }
      }
    };
    reader.readAsDataURL(file);
  }

  _setSrc(src) {
    this._img.src = src;
    this._img.style.display = 'block';
    this._hint.style.display = 'none';
  }
}

if (typeof window !== 'undefined' && window.customElements && !window.customElements.get('image-slot')) {
  window.customElements.define('image-slot', ImageSlot);
}
