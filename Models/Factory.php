<?php

namespace Modules\FactoryManagement3D\Models;

use Illuminate\Database\Eloquent\Model;

class Factory extends Model
{
    protected $table = 'fm3d_factories';

    protected $fillable = ['tenant_id', 'code', 'name', 'timezone', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];
}
