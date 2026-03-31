import { LitElement, css, html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'

@customElement('replace-help-popup')
export class HelpPopup extends LitElement {
  @state()
  show = false;

  static styles = css`
    .help-toggle {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 20;
      cursor: pointer;
      opacity: 0.5;
      transition: opacity 200ms ease-out;
    }

    .help-toggle:hover {
      opacity: 1;
    }

    .help-toggle svg {
      stroke: white;
    }

    .help-card {
      position: absolute;
      top: 52px;
      right: 16px;
      z-index: 20;
      background: rgb(40 40 40 / 92%);
      border-radius: 10px;
      padding: 16px 20px;
      color: white;
      font-family: sans-serif;
      font-size: 14px;
      min-width: 220px;
      box-shadow: rgba(0, 0, 0, 0.3) 0px 4px 12px;
    }

    .help-card h3 {
      margin: 0 0 12px 0;
      font-size: 15px;
    }

    .help-card table {
      width: 100%;
      border-collapse: collapse;
    }

    .help-card td {
      padding: 3px 0;
    }

    .help-card td:first-child {
      font-weight: bold;
      padding-right: 16px;
      white-space: nowrap;
    }

    .help-card .section {
      color: #888;
      font-size: 12px;
      text-transform: uppercase;
      padding-top: 10px;
      padding-bottom: 4px;
    }

    kbd {
      background: rgb(80 80 80);
      border-radius: 4px;
      padding: 1px 6px;
      font-family: monospace;
      font-size: 13px;
    }
  `

  render() {
    return html`
      <div class="help-toggle"
        @mouseenter=${() => this.show = true}
        @mouseleave=${() => this.show = false}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
      </div>
      ${this.show ? html`
        <div class="help-card"
          @mouseenter=${() => this.show = true}
          @mouseleave=${() => this.show = false}>
          <h3>Keyboard Shortcuts</h3>
          <table>
            <tr><td class="section" colspan="2">Playback</td></tr>
            <tr><td><kbd>j</kbd></td><td>Play backward</td></tr>
            <tr><td><kbd>k</kbd></td><td>Pause</td></tr>
            <tr><td><kbd>l</kbd></td><td>Play forward</td></tr>
            <tr><td><kbd>f</kbd></td><td>Cycle speed</td></tr>
            <tr><td><kbd>0</kbd>-<kbd>9</kbd></td><td>Jump to 0%-90%</td></tr>
            <tr><td class="section" colspan="2">Canvas</td></tr>
            <tr><td><kbd>=</kbd> / <kbd>-</kbd></td><td>Zoom in / out</td></tr>
            <tr><td><kbd>Arrow keys</kbd></td><td>Pan</td></tr>
            <tr><td>Scroll wheel</td><td>Zoom to cursor</td></tr>
            <tr><td>Click + drag</td><td>Pan</td></tr>
          </table>
        </div>
      ` : nothing}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'replace-help-popup': HelpPopup
  }
}
