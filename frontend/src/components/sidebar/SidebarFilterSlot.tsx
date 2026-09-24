import React from 'react';

import { isRedisConnection } from './redisSidebarOverview';
import RedisSidebarOverviewBar from './RedisSidebarOverviewBar';

type SidebarFilterSlotProps = {
  /** The active connection, used to decide whether the Redis summary applies. */
  activeConnection: { id?: unknown; config?: { type?: unknown } } | null | undefined;
  /** The sidebar tree; the Redis summary reads its connection children out of it. */
  treeData: ReadonlyArray<any> | null | undefined;
};

/**
 * The strip between the sidebar toolbar and the tree.
 *
 * Relational object-kind filters used to live here. The tree already groups
 * tables, views, and routines under each database, so that icon row is gone.
 * Redis still uses the strip for its key and database counts.
 */
const SidebarFilterSlot = React.memo(({
  activeConnection,
  treeData,
}: SidebarFilterSlotProps) => {
  if (!isRedisConnection(activeConnection)) return null;

  return (
    <div className="gn-v2-explorer-filter-slot" data-redis-sidebar-overview-slot="true">
      <RedisSidebarOverviewBar connection={activeConnection} treeData={treeData} />
    </div>
  );
});

SidebarFilterSlot.displayName = 'SidebarFilterSlot';

export default SidebarFilterSlot;
