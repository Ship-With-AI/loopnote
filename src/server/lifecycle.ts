import { RENAME_MAP } from '../domain/product-identity.js';

export type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export interface ShutdownSignalSource {
  on(signal: ShutdownSignal, listener: () => void): unknown;
  off(signal: ShutdownSignal, listener: () => void): unknown;
}

export interface ShutdownControllerOptions {
  readonly abortActiveWork: () => void;
  readonly closeListener: () => Promise<void>;
  readonly signalSource?: ShutdownSignalSource;
  readonly setExitStatus?: (status: number) => void;
  readonly reportError?: (error: unknown) => void;
}

export interface ShutdownController {
  readonly isShuttingDown: boolean;
  shutdown(exitStatus?: number): Promise<void>;
}

const signalExitStatus: Readonly<Record<ShutdownSignal, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
};

export function createShutdownController(
  options: ShutdownControllerOptions,
): ShutdownController {
  const signalSource = options.signalSource ?? process;
  const setExitStatus =
    options.setExitStatus ??
    ((status: number) => {
      process.exitCode = status;
    });
  const reportError =
    options.reportError ??
    ((error: unknown) => {
      console.error(`${RENAME_MAP.displayName} shutdown failed.`, error);
    });
  let shutdownPromise: Promise<void> | undefined;

  const signalHandlers: Record<ShutdownSignal, () => void> = {
    SIGINT: () => {
      void shutdown(signalExitStatus.SIGINT).catch(reportError);
    },
    SIGTERM: () => {
      void shutdown(signalExitStatus.SIGTERM).catch(reportError);
    },
  };

  function removeSignalHandlers(): void {
    signalSource.off('SIGINT', signalHandlers.SIGINT);
    signalSource.off('SIGTERM', signalHandlers.SIGTERM);
  }

  function shutdown(exitStatus = 0): Promise<void> {
    if (shutdownPromise !== undefined) {
      return shutdownPromise;
    }

    removeSignalHandlers();
    shutdownPromise = (async () => {
      let abortFailure: unknown;
      try {
        options.abortActiveWork();
      } catch (error) {
        abortFailure = error;
      }

      let closeFailure: unknown;
      try {
        await options.closeListener();
      } catch (error) {
        closeFailure = error;
      } finally {
        setExitStatus(exitStatus);
      }

      if (abortFailure !== undefined && closeFailure !== undefined) {
        throw new AggregateError(
          [abortFailure, closeFailure],
          'Active work abort and listener close both failed',
        );
      }
      if (abortFailure !== undefined) {
        throw abortFailure;
      }
      if (closeFailure !== undefined) {
        throw closeFailure;
      }
    })();
    return shutdownPromise;
  }

  signalSource.on('SIGINT', signalHandlers.SIGINT);
  signalSource.on('SIGTERM', signalHandlers.SIGTERM);

  return {
    get isShuttingDown() {
      return shutdownPromise !== undefined;
    },
    shutdown,
  };
}
