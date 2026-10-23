<?php

namespace Modules\FactoryManagement3D;

class Installer
{
    public function install(): void
    {
        // ModuleManager runs migrations separately. Deliberately no core writes,
        // fabricated factory seeds or global role/permission changes on install.
    }

    public function uninstall(): void
    {
        // Preserve layouts, links, audit history and private models for reinstall.
    }
}
