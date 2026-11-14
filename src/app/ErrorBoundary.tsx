import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { FatalScreen } from "@/components/layout/SplashScreen";

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <FatalScreen
          title="界面出现异常"
          message="BrowserHub 的界面组件遇到未处理的错误。浏览器环境数据没有被修改，可以重新加载界面继续使用。"
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              重新加载界面
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}
