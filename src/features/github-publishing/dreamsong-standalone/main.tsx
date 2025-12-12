/**
 * Standalone DreamSong Entry Point for GitHub Pages
 *
 * This is a minimal React app that renders a DreamSong component
 * using data embedded in the HTML file.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { DreamSong } from '../../dreamweaving/components/DreamSong';
import { DreamSongBlock } from '../../dreamweaving/types/dreamsong';
import { MediaFile } from '../../dreamnode';

interface DreamSongData {
  dreamNodeName: string;
  dreamNodeId: string;
  dreamTalkMedia?: MediaFile[];
  blocks: DreamSongBlock[];
  linkResolver?: {
    githubPagesUrls: Record<string, string>;
    githubRepoUrls: Record<string, string>;
    radicleIds: Record<string, string>;
  };
}

function App() {
  // Extract data from embedded script tag
  const dataElement = document.getElementById('dreamsong-data');
  if (!dataElement || !dataElement.textContent) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h1>Error: No DreamSong data found</h1>
        <p>This page may be corrupted or incomplete.</p>
      </div>
    );
  }

  let data: DreamSongData;
  try {
    data = JSON.parse(dataElement.textContent);
  } catch (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h1>Error: Invalid DreamSong data</h1>
        <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    );
  }

  // Handler for media clicks - resolves to appropriate hosted URL
  const handleMediaClick = (sourceDreamNodeId: string) => {
    if (!data.linkResolver) {
      console.log('No link resolver available for:', sourceDreamNodeId);
      return;
    }

    // Priority: GitHub Pages > GitHub Repo > Radicle Web UI > None
    const pagesUrl = data.linkResolver.githubPagesUrls[sourceDreamNodeId];
    if (pagesUrl) {
      window.open(pagesUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const repoUrl = data.linkResolver.githubRepoUrls[sourceDreamNodeId];
    if (repoUrl) {
      window.open(repoUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const radicleId = data.linkResolver.radicleIds[sourceDreamNodeId];
    if (radicleId) {
      const radicleWebUrl = `https://app.radicle.xyz/nodes/seed.radicle.garden/${radicleId}`;
      window.open(radicleWebUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // No hosted version available
    console.log('DreamNode not hosted anywhere:', sourceDreamNodeId);
  };

  return (
    <div style={{ width: '100%' }}>
      <DreamSong
        blocks={data.blocks}
        sourceDreamNodeId={data.dreamNodeId}
        dreamNodeName={data.dreamNodeName}
        dreamTalkMedia={data.dreamTalkMedia}
        onMediaClick={handleMediaClick}
      />
    </div>
  );
}

// Mount React app
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
