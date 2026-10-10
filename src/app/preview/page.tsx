'use client';

import dynamic from 'next/dynamic';
import './preview.css';

const PreviewStage = dynamic(() => import('./stage').then((mod) => mod.PreviewStage), {
  ssr: false,
  loading: () => <p className="preview-status">Loading Nova, Kai, Sky, and Ember.</p>,
});

export default function PreviewPage() {
  return (
    <main className="preview-page">
      <h1>Your voice moves the mouth.</h1>
      <p className="preview-lead">Nothing waits on the server.</p>
      <PreviewStage />
      <p className="preview-credit">
        VTubeMe, CC BY 4.0, <a href="https://vtubeme.com/free-vrm-avatars">https://vtubeme.com/free-vrm-avatars</a>
      </p>
    </main>
  );
}
