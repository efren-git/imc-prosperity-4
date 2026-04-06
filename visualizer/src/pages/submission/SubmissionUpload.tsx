import { Group, Text } from '@mantine/core';
import { Dropzone, FileRejection } from '@mantine/dropzone';
import { IconUpload } from '@tabler/icons-react';
import { ReactNode, useCallback, useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert.tsx';
import { useAsync } from '../../hooks/use-async.ts';
import { useStore } from '../../store.ts';
import { AlgorithmParseError, parseVisualizerInput } from '../../utils/algorithm.tsx';
import { VisualizerCard } from '../visualizer/VisualizerCard.tsx';

function DropzoneIdle(): ReactNode {
  return (
    <Group justify="center" gap="xl" style={{ minHeight: 100, pointerEvents: 'none' }}>
      <IconUpload size={48} />
      <div>
        <Text size="xl" fw={600}>
          Drop your submission file here
        </Text>
        <Text size="sm" c="dimmed" mt={4}>
          Accepts <b>.log</b> or <b>.json</b> from the IMC Prosperity website
        </Text>
      </div>
    </Group>
  );
}

export function SubmissionUpload(): ReactNode {
  const [error, setError] = useState<Error | undefined>();

  const setAlgorithm = useStore(state => state.setAlgorithm);
  const setMonteCarlo = useStore(state => state.setMonteCarlo);

  const onDrop = useAsync(
    (files: File[]) =>
      new Promise<void>((resolve, reject) => {
        setError(undefined);

        const reader = new FileReader();

        reader.addEventListener('load', () => {
          try {
            const parsed = parseVisualizerInput(reader.result as string);
            if (parsed.kind === 'algorithm') {
              setAlgorithm(parsed.algorithm);
            } else {
              setMonteCarlo(parsed.monteCarlo);
            }
            resolve();
          } catch (err: any) {
            reject(err);
          }
        });

        reader.addEventListener('error', () => {
          reject(new Error('FileReader emitted an error event'));
        });

        reader.readAsText(files[0]);
      }),
  );

  const onReject = useCallback((rejections: FileRejection[]) => {
    const messages: string[] = [];
    for (const rejection of rejections) {
      const errorType =
        ({
          'file-invalid-type': 'Invalid type.',
          'file-too-large': 'File too large.',
          'file-too-small': 'File too small.',
          'too-many-files': 'Too many files.',
        } as Record<string, string>)[rejection.errors[0].code] ?? rejection.errors[0].message;
      messages.push(`Could not load ${rejection.file.name}: ${errorType}`);
    }
    setError(new Error(messages.join('\n')));
  }, []);

  const parseError = onDrop.error instanceof AlgorithmParseError ? onDrop.error : undefined;
  const genericError = onDrop.error && !parseError ? onDrop.error : undefined;

  return (
    <VisualizerCard title="Load Submission File">
      <Text mb="md" c="dimmed">
        Drop a <b>.log</b> or <b>.json</b> file downloaded from the IMC Prosperity submission page. Both formats are
        auto-detected.
      </Text>

      {error && <ErrorAlert error={error} />}
      {genericError && <ErrorAlert error={genericError} />}
      {parseError && (
        <div style={{ marginBottom: 8 }}>
          <ErrorAlert error={parseError} />
        </div>
      )}

      <Dropzone onDrop={onDrop.call} onReject={onReject} multiple={false} loading={onDrop.loading} mb="xs">
        <Dropzone.Idle>
          <DropzoneIdle />
        </Dropzone.Idle>
        <Dropzone.Accept>
          <DropzoneIdle />
        </Dropzone.Accept>
      </Dropzone>
    </VisualizerCard>
  );
}
