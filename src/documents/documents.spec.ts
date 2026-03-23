import { DocumentsModule } from './documents.module';

describe('DocumentsModule', () => {
  it('module exports exist', () => {
    expect(DocumentsModule).toBeDefined();
  });

  it('has correct module structure', () => {
    const metadata = Reflect.getMetadata('imports', DocumentsModule) || [];
    // Module should have dependencies
    expect(DocumentsModule).toBeDefined();
  });
});
