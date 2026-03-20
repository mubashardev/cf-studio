import { Suspense, lazy, type ComponentType } from 'react';
import { FreeExportDialog, type ExportDialogProps } from './FreeExportDialog';
import { Loader2 } from 'lucide-react';

const globModules = import.meta.glob('../pro_modules/frontend/ProFeatureGate.tsx');
const ProDialogImport = Object.values(globModules)[0] as (() => Promise<any>) | undefined;

const ProModule: ComponentType<ExportDialogProps> | null = ProDialogImport
  ? lazy(() => ProDialogImport().then((m: any) => ({ default: m.ProFeatureGate })))
  : null;

export function ExportWrapper(props: ExportDialogProps) {
  if (ProModule) {
    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-4 text-sm text-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading...
          </div>
        }
      >
        <ProModule {...props} />
      </Suspense>
    );
  }

  return <FreeExportDialog {...props} />;
}
