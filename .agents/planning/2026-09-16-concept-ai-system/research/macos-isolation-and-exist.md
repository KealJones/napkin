# macOS execution boundaries and later autonomy

## macOS sandbox findings

Apple's App Sandbox is enforced by macOS and limits an app's access to files, network connections, and other resources. A user can choose individual files or folders through system open/save panels; macOS extends the app's sandbox for the selected locations, and security-scoped bookmarks can preserve access across launches. See [App Sandbox](https://developer.apple.com/documentation/security/app_sandbox) and [Accessing files from the macOS App Sandbox](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox).

There is a practical limitation for this project: Apple's documentation says user-selected-file entitlements do not let a sandboxed app run programs from arbitrary locations outside its app bundle, container, or app-group containers. Shell/CLI and external-program Concepts need a deliberate execution boundary; a native app sandbox by itself may not cover the desired workflow cleanly.

Node's built-in Permission Model is stable, but Node describes it as a seat belt for trusted code, not a security boundary against malicious code. Its docs explicitly warn that malicious code may bypass it and recommend operating-system isolation for that threat model. It is useful for reducing accidents in the trusted runtime, but it should not be presented as the safety mechanism for autonomous code execution. See [Node.js Permission Model](https://nodejs.org/api/permissions.html).

## VM option for the later sandbox phase

Docker Desktop on Mac runs containers inside a Linux VM. Docker documents that root inside a container does not grant root access to the Mac host; host access is through explicitly shared directories. Docker also documents that published ports listen on all network interfaces by default unless bound to 127.0.0.1. See [Docker's Mac permissions and VM boundary](https://docs.docker.com/desktop/setup/install/mac-permission-requirements/) and [Docker Desktop networking](https://docs.docker.com/desktop/features/networking/).

This makes a local VM/container a practical candidate for the later autonomous execution phase, with constraints:
- Keep the autonomous workspace in VM/container storage or mount only the dedicated sandbox directory.
- Never mount the host home directory or Docker control socket into the autonomous worker.
- Publish only the dashboard port on loopback.
- If the user enables access to host files, grant specific folders and modes rather than mounting the whole home directory by default.
- Keep outbound networking as an explicit access capability because research requires it; record destinations and results in the trace.

This is a research option, not a final choice. Docker adds an installation and local VM dependency, while native App Sandbox has external-program limits. A focused implementation spike should verify usability before choosing the final host bridge.

## Scope agreed with the user

Defer both always-on Exist behavior and the sandboxed autonomous system-action environment until the Concept framework can demonstrate useful thinking. The early system can run on demand, accept a Concept expression or local-model interpretation, compose/evaluate Concepts, return a Concept answer, and expose its trace. Add scheduled/continuous Exist and autonomous file/CLI/network actions later.

## Sources

- [Apple App Sandbox](https://developer.apple.com/documentation/security/app_sandbox)
- [Apple file access from the sandbox](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox)
- [Node.js Permission Model](https://nodejs.org/api/permissions.html)
- [Docker Desktop for Mac permissions](https://docs.docker.com/desktop/setup/install/mac-permission-requirements/)
- [Docker Desktop networking](https://docs.docker.com/desktop/features/networking/)

