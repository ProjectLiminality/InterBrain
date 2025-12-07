import { App, Modal } from 'obsidian';
import { CoherenceBeacon } from '../../services/coherence-beacon-service';

export class CoherenceBeaconModal extends Modal {
  private beacon: CoherenceBeacon;
  private onAccept: () => void;
  private onReject: () => void;

  constructor(
    app: App,
    beacon: CoherenceBeacon,
    onAccept: () => void,
    onReject: () => void
  ) {
    super(app);
    this.beacon = beacon;
    this.onAccept = onAccept;
    this.onReject = onReject;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.addClass('coherence-beacon-modal');

    // Title
    contentEl.createEl('h2', { text: '🌟 New Supermodule Detected' });

    // Description
    const description = contentEl.createDiv({ cls: 'beacon-description' });
    description.createEl('p', {
      text: `This DreamNode is now referenced by:`
    });

    // Supermodule info
    const infoBox = description.createDiv({ cls: 'beacon-info' });
    infoBox.createEl('div', {
      text: `→ ${this.beacon.title}`,
      cls: 'beacon-title'
    });
    infoBox.createEl('div', {
      text: this.beacon.radicleId,
      cls: 'beacon-radicle-id'
    });

    // Question
    description.createEl('p', {
      text: `Would you like to clone ${this.beacon.title} to your vault?`,
      cls: 'beacon-question'
    });

    // Explanation
    const explanation = description.createDiv({ cls: 'beacon-explanation' });
    explanation.createEl('p', {
      text: `Accepting will:`,
      cls: 'explanation-header'
    });
    const acceptList = explanation.createEl('ul');
    acceptList.createEl('li', { text: 'Clone the supermodule repository to your vault' });
    acceptList.createEl('li', { text: 'Update metadata to track the relationship' });
    acceptList.createEl('li', { text: 'Allow you to explore connected ideas' });

    explanation.createEl('p', {
      text: `Rejecting will:`,
      cls: 'explanation-header'
    });
    const rejectList = explanation.createEl('ul');
    rejectList.createEl('li', { text: 'Keep your current perspective unchanged' });
    rejectList.createEl('li', { text: 'Ignore this supermodule connection' });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'beacon-buttons' });

    const acceptButton = buttonContainer.createEl('button', {
      text: 'Clone',
      cls: 'mod-cta'
    });
    acceptButton.addEventListener('click', () => {
      this.close();
      this.onAccept();
    });

    const rejectButton = buttonContainer.createEl('button', {
      text: 'Not Now'
    });
    rejectButton.addEventListener('click', () => {
      this.close();
      this.onReject();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
