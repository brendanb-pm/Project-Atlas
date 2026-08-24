import { createHttpServer, createPreproductionEdge } from './edge.js';
import { AtlasAuthority } from './authority.js';

// This intentionally cannot start a usable production edge: PostgreSQL session
// storage, tenant identity data, and live OIDC configuration belong to MOS-133C/activation.
const edge = createPreproductionEdge({
  config: { environment: process.env.NODE_ENV === 'production' ? 'production' : 'preproduction', origin: process.env.ATLAS_EDGE_ORIGIN || 'https://atlas.local.invalid', sessionStoreKind: process.env.ATLAS_SESSION_STORE || 'postgresql-required', allowedRoutes: ['home'] },
  providers: {}, authority: new AtlasAuthority()
});
const port = Number(process.env.PORT || 8080); createHttpServer(edge).listen(port, '127.0.0.1', () => console.log(`Atlas secure-session edge listening on ${port}`));
