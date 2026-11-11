import { Composition, registerRoot } from "remotion";
import { Demo, TOTAL } from "./Demo";

const Root = () => <Composition id="ShowUpDemo" component={Demo} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />;

registerRoot(Root);
