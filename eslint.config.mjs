import stampix from "@stampix/eslint-config";
import { globalIgnores } from "eslint/config";

export default [...stampix, globalIgnores(["node_modules", "dist"])];
