import { CommentGenerator } from '@/features/campaigns/CommentGenerator';

export const metadata = { title: 'AI Comments · ACQ Console' };

export default function CampaignsPage() {
  return (
    <>
      <h1>AI Comments</h1>
      <p className="sub">Generate a context-aware, human-sounding comment for a target via the LLM (content.comment).</p>
      <CommentGenerator />
    </>
  );
}
