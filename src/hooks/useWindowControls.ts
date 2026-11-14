import { useEffect, useState } from "react";
import { call, isTauriEnvironment } from "@/lib/ipc";

interface WindowControls {
  maximized: boolean;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
}

/**
 * Window chrome lives in the Rust process so that close/minimize behaviour
 * always respects the persisted settings, even if the UI state is stale.
 */
export function useWindowControls(): WindowControls {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }

    let active = true;

    const sync = () => {
      void call<boolean>("window_is_maximized")
        .then((value) => {
          if (active) {
            setMaximized(value);
          }
        })
        .catch(() => {
          // The window can disappear while a resize event is in flight.
        });
    };

    sync();
    window.addEventListener("resize", sync);
    return () => {
      active = false;
      window.removeEventListener("resize", sync);
    };
  }, []);

  return {
    maximized,
    minimize: () => {
      if (isTauriEnvironment()) {
        void call("window_minimize");
      }
    },
    toggleMaximize: () => {
      if (isTauriEnvironment()) {
        void call<boolean>("window_toggle_maximize")
          .then(setMaximized)
          .catch(() => undefined);
      }
    },
    close: () => {
      if (isTauriEnvironment()) {
        void call("window_close");
      }
    },
  };
}
