<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fm3d_factories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->nullable()->index();
            $table->string('code', 80);
            $table->string('name', 200);
            $table->string('timezone', 80)->default('Asia/Ho_Chi_Minh');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        // PostgreSQL and SQLite share partial-index semantics. A conventional
        // (tenant_id, code) unique index alone permits duplicate NULL tenants.
        DB::statement('CREATE UNIQUE INDEX fm3d_factories_tenant_code_unique ON fm3d_factories (tenant_id, code) WHERE tenant_id IS NOT NULL');
        DB::statement('CREATE UNIQUE INDEX fm3d_factories_null_code_unique ON fm3d_factories (code) WHERE tenant_id IS NULL');
        Schema::create('fm3d_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('factory_id')->constrained('fm3d_factories')->cascadeOnDelete();
            $table->foreignId('line_id')->unique()->constrained('lines')->restrictOnDelete();
        });
        Schema::create('fm3d_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('factory_id')->constrained('fm3d_factories')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('can_edit_layout')->default(false);
            $table->unique(['factory_id', 'user_id']);
        });
        Schema::create('fm3d_layouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('factory_id')->unique()->constrained('fm3d_factories')->cascadeOnDelete();
            $table->unsignedInteger('version')->default(0);
            $table->unsignedInteger('published_version')->nullable();
            $table->json('draft');
            $table->json('published')->nullable();
            $table->timestamps();
        });
        Schema::create('fm3d_assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('factory_id')->constrained('fm3d_factories')->cascadeOnDelete();
            $table->string('name', 200);
            $table->string('path');
            $table->string('checksum', 64);
            $table->unsignedInteger('size_bytes');
            $table->unsignedInteger('triangles');
            $table->unsignedBigInteger('uploaded_by');
            $table->timestamps();
        });
        Schema::create('fm3d_audits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('factory_id')->constrained('fm3d_factories')->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->string('action', 80);
            $table->json('details');
            $table->timestamp('created_at');
        });
    }

    public function down(): void
    {
        foreach (['fm3d_audits', 'fm3d_assets', 'fm3d_layouts', 'fm3d_members', 'fm3d_lines', 'fm3d_factories'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
