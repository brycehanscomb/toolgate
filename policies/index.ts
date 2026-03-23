import denyGitAddAndCommit from "./deny-git-add-and-commit";
import denyWritesOutsideProject from "./deny-writes-outside-project";
import redirectPlansToProject from "./redirect-plans-to-project";
import allowBunTest from "./allow-bun-test";
import allowGitAdd from "./allow-git-add";
import allowGitDiff from "./allow-git-diff";
import allowGitLog from "./allow-git-log";
import allowGitStatus from "./allow-git-status";
import allowGrepInProject from "./allow-grep-in-project";
import allowLsInProject from "./allow-ls-in-project";
import allowExploreInProject from "./allow-explore-in-project";
import allowReadInProject from "./allow-read-in-project";
import allowSearchInProject from "./allow-search-in-project";
import allowFindInProject from "./allow-find-in-project";
import allowPlanInProject from "./allow-plan-in-project";
import allowWebFetchClaude from "./allow-webfetch-claude";
import allowTaskCreate from "./allow-task-create";
import allowGhReadOnly from "./allow-gh-read-only";
import allowBashFindInProject from "./allow-bash-find-in-project";

export const builtinPolicies = [
  denyGitAddAndCommit,
  redirectPlansToProject,
  denyWritesOutsideProject,
  allowBunTest,
  allowGitAdd,
  allowGitDiff,
  allowGitLog,
  allowGitStatus,
  allowGrepInProject,
  allowLsInProject,
  allowExploreInProject,
  allowReadInProject,
  allowSearchInProject,
  allowFindInProject,
  allowPlanInProject,
  allowWebFetchClaude,
  allowTaskCreate,
  allowGhReadOnly,
  allowBashFindInProject,
];
