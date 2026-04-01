import { LitElement, css, html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'

@customElement('replace-credits-popup')
export class CreditsPopup extends LitElement {
  @state()
  show = false;

  #hideTimeout = 0;

  private scheduleHide() {
    this.#hideTimeout = window.setTimeout(() => this.show = false, 150);
  }

  private cancelHide() {
    clearTimeout(this.#hideTimeout);
  }

  static styles = css`
    :host {
      display: block;
    }

    .credits-toggle {
      cursor: pointer;
      opacity: 0.5;
      transition: opacity 200ms ease-out;
    }

    .credits-toggle:hover {
      opacity: 1;
    }

    .credits-toggle svg {
      stroke: white;
      display: block;
    }

    .credits-card {
      position: fixed;
      top: 52px;
      right: 16px;
      z-index: 30;
      background: rgb(40 40 40 / 92%);
      border-radius: 10px;
      padding: 16px 20px;
      color: white;
      font-family: sans-serif;
      font-size: 14px;
      min-width: 220px;
      box-shadow: rgba(0, 0, 0, 0.3) 0px 4px 12px;
      line-height: 1.6;
    }

    .credits-card h3 {
      margin: 0 0 12px 0;
      font-size: 15px;
    }

    .credits-card p {
      margin: 0 0 8px 0;
    }

    .credits-card p:last-child {
      margin-bottom: 0;
    }

    .credits-card a {
      color: #7eb8f7;
      text-decoration: none;
    }

    .credits-card a:hover {
      text-decoration: underline;
    }
  `

  render() {
    return html`
      <div class="credits-toggle"
        @mouseenter=${() => { this.cancelHide(); this.show = true; }}
        @mouseleave=${() => this.scheduleHide()}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>
      </div>
      ${this.show ? html`
        <div class="credits-card"
          @mouseenter=${() => this.cancelHide()}
          @mouseleave=${() => this.scheduleHide()}>
          <h3>Credits</h3>
          <p>Created by <a href="https://github.com/WinterCore" target="_blank" rel="noopener noreferrer">WinterCore</a></p>
          <p>Amongi detection inspired by <a href="https://github.com/Woutervdvelde/AmongiAnalyser" target="_blank" rel="noopener noreferrer">Woutervdvelde</a></p>
        </div>
      ` : nothing}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'replace-credits-popup': CreditsPopup
  }
}
