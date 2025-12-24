/**
 * Tutorial Settings Section
 *
 * Feature-owned settings section for tutorial configuration and credits.
 */

/**
 * Create the tutorial settings section
 */
export function createTutorialSettingsSection(containerEl: HTMLElement): void {
  const header = containerEl.createEl('h2', { text: '🎓 Tutorial & Credits' });
  header.id = 'tutorial-section';

  // Music Attribution
  const musicDiv = containerEl.createDiv({ cls: 'interbrain-tutorial-credits' });

  musicDiv.createEl('h4', { text: '🎵 Tutorial Music' });

  const attribution = musicDiv.createEl('p', {
    cls: 'setting-item-description'
  });
  attribution.innerHTML = `
    Music: <strong>"Fractals"</strong> by <strong>Vincent Rubinetti</strong><br>
    from the album <em>"The Music of 3Blue1Brown"</em>
  `;

  const linksDiv = musicDiv.createDiv({ cls: 'tutorial-music-links' });
  linksDiv.style.marginTop = '8px';
  linksDiv.style.display = 'flex';
  linksDiv.style.flexDirection = 'column';
  linksDiv.style.gap = '4px';

  const bandcampLink = linksDiv.createEl('a', {
    text: '🎧 Listen on Bandcamp',
    href: 'https://vincerubinetti.bandcamp.com/album/the-music-of-3blue1brown'
  });
  bandcampLink.style.fontSize = '13px';

  const artistLink = linksDiv.createEl('a', {
    text: '🎨 Vincent Rubinetti\'s Website',
    href: 'https://vincentrubinetti.com/'
  });
  artistLink.style.fontSize = '13px';

  const permissionLink = linksDiv.createEl('a', {
    text: '📋 Music Usage Permission Form',
    href: 'https://vincerubinetti.github.io/using-the-music-of-3blue1brown/'
  });
  permissionLink.style.fontSize = '13px';

  // Separator
  containerEl.createEl('hr', { cls: 'interbrain-settings-separator' });
}
