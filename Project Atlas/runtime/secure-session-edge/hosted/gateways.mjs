import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AiProviderFailure } from '../src/ai-processing.js';
import { secret } from './config.mjs';

async function bounded(stream, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > limit) throw new Error('Provider response exceeded configured limit');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

export async function createGateways(settings) {
  const endpoint = new URL(settings.ai.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || !settings.storageRegion) {
    throw new Error('Provider configuration is invalid');
  }
  const s3 = new S3Client({
    region: settings.storageRegion,
    credentials: JSON.parse(await secret('s3-credentials-json'))
  });
  function object(bucket, key) {
    if (bucket !== settings.storageBucket || !/^[a-f0-9]{20}\/ATTACH-[a-f0-9-]{36}$/i.test(key)) {
      throw new Error('Storage reference outside acceptance scope');
    }
    return { Bucket: bucket, Key: key };
  }
  const storageGateway = {
    putObject: ({ bucket, key, body, contentType, checksumSha256 }) => s3.send(new PutObjectCommand({
      ...object(bucket, key), Body: body, ContentType: contentType,
      ChecksumSHA256: Buffer.from(checksumSha256, 'hex').toString('base64')
    }), { abortSignal: AbortSignal.timeout(20_000) }),
    async getObject({ bucket, key }) {
      const result = await s3.send(new GetObjectCommand(object(bucket, key)), { abortSignal: AbortSignal.timeout(20_000) });
      const body = await bounded(result.Body, 50 * 1024 * 1024);
      return { body, mediaType: result.ContentType, checksumSha256: createHash('sha256').update(body).digest('hex') };
    },
    deleteObject: ({ bucket, key }) => s3.send(new DeleteObjectCommand(object(bucket, key)), {
      abortSignal: AbortSignal.timeout(20_000)
    })
  };
  const token = await secret('ai-gateway-token');
  const aiGateway = {
    async extract(request) {
      try {
        const body = JSON.stringify({ ...request, evidence: request.evidence.map(({ body, ...item }) =>
          body ? { ...item, bodyBase64: Buffer.from(body).toString('base64') } : item) });
        if (Buffer.byteLength(body) > 10 * 1024 * 1024) throw new AiProviderFailure('EVIDENCE_TOO_LARGE');
        const response = await fetch(endpoint, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body
        });
        if (!response.ok) throw new AiProviderFailure('PROVIDER_UNAVAILABLE', { retryable: response.status >= 500 || response.status === 429 });
        return JSON.parse((await bounded(response.body, 1024 * 1024)).toString('utf8'));
      } catch (error) {
        if (error instanceof AiProviderFailure) throw error;
        throw new AiProviderFailure('PROVIDER_UNAVAILABLE', { retryable: true });
      }
    }
  };
  return { storageGateway, aiGateway };
}
