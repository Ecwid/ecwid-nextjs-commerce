import OpengraphImage from 'components/opengraph-image';
import { getCollection } from 'lib/ecwid';

export const runtime = 'edge';

export default async function Image({ params }: { params: Promise<{ collection: string }> }) {
  const { collection: collectionSlug } = await params;
  const collection = await getCollection(collectionSlug);
  const title = collection?.seo?.title || collection?.title;

  return await OpengraphImage({ title });
}
