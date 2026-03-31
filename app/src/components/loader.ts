import { LitElement, css, html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('replace-loader')
export class Loader extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .loader {
      width: var(--loader-size, 45px);
      aspect-ratio: 1;
      --c: no-repeat repeating-linear-gradient(90deg, #fff 0 calc(100%/7), #0000 0 calc(200%/7));
      background: var(--c), var(--c), var(--c), var(--c);
      background-size: 140% 26%;
      animation: l26 .75s infinite linear;
    }

    @keyframes l26 {
      0%,
      5%   { background-position: 0    calc(0*100%/3), 0    calc(1*100%/3), 0    calc(2*100%/3), 0    calc(3*100%/3) }
      20%  { background-position: 50%  calc(0*100%/3), 0    calc(1*100%/3), 0    calc(2*100%/3), 0    calc(3*100%/3) }
      40%  { background-position: 100% calc(0*100%/3), 50%  calc(1*100%/3), 0    calc(2*100%/3), 0    calc(3*100%/3) }
      60%  { background-position: 100% calc(0*100%/3), 100% calc(1*100%/3), 50%  calc(2*100%/3), 0    calc(3*100%/3) }
      80%  { background-position: 100% calc(0*100%/3), 100% calc(1*100%/3), 100% calc(2*100%/3), 50%  calc(3*100%/3) }
      95%,
      100% { background-position: 100% calc(0*100%/3), 100% calc(1*100%/3), 100% calc(2*100%/3), 100% calc(3*100%/3) }
    }
  `

  render() {
    return html`<div class="loader"></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'replace-loader': Loader
  }
}
